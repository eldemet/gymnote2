// Database setup with Dexie
const db = new Dexie('GymNoteDB');

// Define schema with versioning
db.version(1).stores({
  machines: '++id, label, muscleGroup, imageFull, imageThumb, createdAt, updatedAt',
  sessions: '++id, date',
  sets: '++id, sessionId, machineId, order, weightKg, reps, rpe, notes',
  settings: 'id, unit, theme, lastBackupAt'
});

// Global state
let currentScreen = 'machines';
let currentMachine = null;
let editingMachine = null;
let editingSet = null;
let appSettings = { unit: 'kg', theme: 'dark' };
let machineChart = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  await initDatabase();
  await loadSettings();
  registerServiceWorker();
  setupEventListeners();
  showScreen('machines');
});

// Database initialization
async function initDatabase() {
  try {
    await db.open();
    
    // Ensure settings exist
    const settings = await db.settings.get('app');
    if (!settings) {
      await db.settings.put({
        id: 'app',
        unit: 'kg',
        theme: 'dark',
        lastBackupAt: null
      });
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    showToast('Database error. Please refresh the page.', 'error');
  }
}

// Load settings
async function loadSettings() {
  try {
    const settings = await db.settings.get('app');
    if (settings) {
      appSettings = settings;
      updateUnitButtons();
      updateWeightUnits();
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Service Worker registration
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js');
      console.log('ServiceWorker registered:', registration);
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateAvailable();
          }
        });
      });
    } catch (error) {
      console.error('ServiceWorker registration failed:', error);
    }
  }
}

// Show update notification
function showUpdateAvailable() {
  const toast = document.getElementById('toast');
  toast.innerHTML = `
    <div class="flex items-center justify-between">
      <span>New version available</span>
      <button onclick="refreshApp()" class="ml-3 px-3 py-1 bg-purple-600 rounded text-sm">
        Update
      </button>
    </div>
  `;
  toast.classList.add('show');
}

// Refresh app to use new version
function refreshApp() {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
  window.location.reload();
}

// Event listeners setup
function setupEventListeners() {
  // Machine search
  document.getElementById('machine-search').addEventListener('input', (e) => {
    filterMachines(e.target.value);
  });
  
  // Machine form
  document.getElementById('machine-form').addEventListener('submit', handleMachineSubmit);
  
  // Set form
  document.getElementById('set-form').addEventListener('submit', handleSetSubmit);
  
  // Photo preview
  document.getElementById('machine-photo').addEventListener('change', previewPhoto);
  
  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModals();
    }
  });
}

// Screen navigation
function showScreen(screenName) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.add('hidden');
  });
  
  // Update navigation
  document.querySelectorAll('[id^="nav-"]').forEach(nav => {
    nav.classList.remove('text-purple-400');
    nav.classList.add('text-gray-400');
  });
  
  currentScreen = screenName;
  
  switch (screenName) {
    case 'machines':
      document.getElementById('machines-screen').classList.remove('hidden');
      document.getElementById('nav-machines').classList.add('text-purple-400');
      document.getElementById('nav-machines').classList.remove('text-gray-400');
      document.getElementById('page-title').textContent = 'GymNote';
      document.getElementById('back-btn').classList.add('hidden');
      document.getElementById('fab').onclick = () => showAddMachineModal();
      document.getElementById('fab').innerHTML = `
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
      `;
      loadMachines();
      break;
      
    case 'machine-detail':
      document.getElementById('machine-detail-screen').classList.remove('hidden');
      document.getElementById('page-title').textContent = currentMachine?.label || 'Machine';
      document.getElementById('back-btn').classList.remove('hidden');
      document.getElementById('fab').onclick = () => showAddSetModal();
      document.getElementById('fab').innerHTML = `
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
      `;
      loadMachineDetail();
      break;
      
    case 'settings':
      document.getElementById('settings-screen').classList.remove('hidden');
      document.getElementById('nav-settings').classList.add('text-purple-400');
      document.getElementById('nav-settings').classList.remove('text-gray-400');
      document.getElementById('page-title').textContent = 'Settings';
      document.getElementById('back-btn').classList.add('hidden');
      document.getElementById('fab').style.display = 'none';
      break;
      
    default:
      showScreen('machines');
  }
  
  if (screenName !== 'settings') {
    document.getElementById('fab').style.display = 'flex';
  }
}

function goBack() {
  if (currentScreen === 'machine-detail') {
    showScreen('machines');
  }
}

// Machine management
async function loadMachines() {
  try {
    const machines = await db.machines.orderBy('label').toArray();
    const machinesList = document.getElementById('machines-list');
    const emptyState = document.getElementById('empty-machines');
    
    if (machines.length === 0) {
      machinesList.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    
    emptyState.classList.add('hidden');
    machinesList.innerHTML = machines.map(machine => `
      <div class="glass rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-colors" 
           onclick="viewMachine(${machine.id})">
        <div class="flex items-center space-x-4">
          ${machine.imageThumb ? 
            `<img src="${URL.createObjectURL(machine.imageThumb)}" alt="${machine.label}" class="w-12 h-12 object-cover rounded-lg">` :
            `<div class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
               <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
               </svg>
             </div>`
          }
          <div class="flex-1">
            <h3 class="font-semibold">${machine.label}</h3>
            ${machine.muscleGroup ? `<p class="text-sm text-gray-400">${machine.muscleGroup}</p>` : ''}
          </div>
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load machines:', error);
    showToast('Failed to load machines', 'error');
  }
}

function filterMachines(query) {
  const machineItems = document.querySelectorAll('#machines-list > div');
  const lowerQuery = query.toLowerCase();
  
  machineItems.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(lowerQuery) ? 'block' : 'none';
  });
}

async function viewMachine(machineId) {
  try {
    currentMachine = await db.machines.get(machineId);
    if (currentMachine) {
      showScreen('machine-detail');
    }
  } catch (error) {
    console.error('Failed to load machine:', error);
    showToast('Failed to load machine', 'error');
  }
}

async function loadMachineDetail() {
  if (!currentMachine) return;
  
  try {
    // Machine info
    const machineDetail = document.getElementById('machine-detail');
    machineDetail.innerHTML = `
      <div class="glass rounded-xl p-4">
        <div class="flex items-center justify-between mb-4">
          ${currentMachine.imageFull ? 
            `<img src="${URL.createObjectURL(currentMachine.imageFull)}" alt="${currentMachine.label}" class="w-20 h-20 object-cover rounded-lg">` :
            `<div class="w-20 h-20 bg-purple-600 rounded-lg flex items-center justify-center">
               <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
               </svg>
             </div>`
          }
          <div class="flex space-x-2">
            <button onclick="showEditMachineModal()" class="p-2 glass rounded-lg">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
            </button>
            <button onclick="confirmDeleteMachine()" class="p-2 bg-red-600 rounded-lg">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
        <div>
          <h2 class="text-xl font-semibold">${currentMachine.label}</h2>
          ${currentMachine.muscleGroup ? `<p class="text-gray-400">${currentMachine.muscleGroup}</p>` : ''}
        </div>
      </div>
    `;
    
    // Load stats and chart
    await loadMachineStats();
    await loadMachineChart();
    await loadMachineHistory();
  } catch (error) {
    console.error('Failed to load machine detail:', error);
    showToast('Failed to load machine details', 'error');
  }
}

async function loadMachineStats() {
  if (!currentMachine) return;
  
  try {
    const sets = await db.sets.where('machineId').equals(currentMachine.id).toArray();
    
    if (sets.length === 0) {
      document.getElementById('machine-stats').innerHTML = `
        <div class="glass rounded-xl p-4 text-center">
          <p class="text-gray-400">No sets recorded yet</p>
        </div>
      `;
      return;
    }
    
    // Calculate best estimated 1RM
    let bestE1RM = 0;
    let bestDate = null;
    
    sets.forEach(set => {
      const epley = set.weightKg * (1 + set.reps / 30);
      const brzycki = set.weightKg * 36 / (37 - set.reps);
      const e1rm = Math.max(epley, brzycki);
      
      if (e1rm > bestE1RM) {
        bestE1RM = e1rm;
        bestDate = set.sessionId;
      }
    });
    
    // Get session date for PR
    const prSession = await db.sessions.get(bestDate);
    const displayWeight = convertWeight(bestE1RM, appSettings.unit);
    
    document.getElementById('machine-stats').innerHTML = `
      <div class="glass rounded-xl p-4">
        <h3 class="text-lg font-semibold mb-3">Personal Records</h3>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-2xl font-bold text-purple-400">${displayWeight.toFixed(1)}</div>
            <div class="text-sm text-gray-400">Best e1RM (${appSettings.unit})</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-400">${sets.length}</div>
            <div class="text-sm text-gray-400">Total Sets</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-blue-400">${prSession ? formatDate(prSession.date) : 'N/A'}</div>
            <div class="text-sm text-gray-400">PR Date</div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load machine stats:', error);
  }
}

async function loadMachineChart() {
  if (!currentMachine) return;
  
  try {
    const chartContainer = document.getElementById('machine-chart-container');
    chartContainer.innerHTML = `
      <div class="glass rounded-xl p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Progress</h3>
          <div class="flex space-x-1">
            <button onclick="setChartRange(7)" class="chart-range px-3 py-1 rounded-lg glass text-sm">7d</button>
            <button onclick="setChartRange(30)" class="chart-range px-3 py-1 rounded-lg glass text-sm">30d</button>
            <button onclick="setChartRange(90)" class="chart-range px-3 py-1 rounded-lg glass text-sm">90d</button>
            <button onclick="setChartRange(null)" class="chart-range px-3 py-1 rounded-lg bg-purple-600 text-sm">All</button>
          </div>
        </div>
        <canvas id="machine-chart" width="400" height="200"></canvas>
      </div>
    `;
    
    await renderMachineChart();
  } catch (error) {
    console.error('Failed to setup machine chart:', error);
  }
}

async function renderMachineChart(days = null) {
  if (!currentMachine) return;
  
  try {
    const canvas = document.getElementById('machine-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (machineChart) {
      machineChart.destroy();
    }
    
    // Get sets data
    const sets = await db.sets.where('machineId').equals(currentMachine.id).toArray();
    const sessions = await db.sessions.toArray();
    const sessionMap = new Map(sessions.map(s => [s.id, s]));
    
    if (sets.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No data to display', canvas.width / 2, canvas.height / 2);
      return;
    }
    
    // Filter by date range
    let filteredSets = sets;
    if (days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffString = cutoffDate.toISOString().split('T')[0];
      
      filteredSets = sets.filter(set => {
        const session = sessionMap.get(set.sessionId);
        return session && session.date >= cutoffString;
      });
    }
    
    // Group by date and calculate daily best e1RM and total volume
    const dailyData = new Map();
    
    filteredSets.forEach(set => {
      const session = sessionMap.get(set.sessionId);
      if (!session) return;
      
      const date = session.date;
      if (!dailyData.has(date)) {
        dailyData.set(date, { e1rm: 0, volume: 0, sets: [] });
      }
      
      const data = dailyData.get(date);
      
      // Calculate e1RM
      const epley = set.weightKg * (1 + set.reps / 30);
      const brzycki = set.weightKg * 36 / (37 - set.reps);
      const e1rm = Math.max(epley, brzycki);
      data.e1rm = Math.max(data.e1rm, e1rm);
      
      // Calculate volume
      const weightDisplay = convertWeight(set.weightKg, appSettings.unit);
      data.volume += weightDisplay * set.reps;
      
      data.sets.push(set);
    });
    
    // Sort dates and prepare chart data
    const sortedDates = Array.from(dailyData.keys()).sort();
    const e1rmData = sortedDates.map(date => convertWeight(dailyData.get(date).e1rm, appSettings.unit));
    const volumeData = sortedDates.map(date => dailyData.get(date).volume);
    const labels = sortedDates.map(date => formatDate(date));
    
    // Create chart
    machineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: `e1RM (${appSettings.unit})`,
            data: e1rmData,
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            yAxisID: 'y',
            tension: 0.25,
            pointBackgroundColor: '#a855f7',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4
          },
          {
            label: `Volume (${appSettings.unit})`,
            data: volumeData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            yAxisID: 'y1',
            tension: 0.25,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#ffffff',
              usePointStyle: true
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#9ca3af' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            ticks: { color: '#a855f7' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            title: {
              display: true,
              text: `e1RM (${appSettings.unit})`,
              color: '#a855f7'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            ticks: { color: '#10b981' },
            grid: { drawOnChartArea: false },
            title: {
              display: true,
              text: `Volume (${appSettings.unit})`,
              color: '#10b981'
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        }
      }
    });
  } catch (error) {
    console.error('Failed to render machine chart:', error);
  }
}

function setChartRange(days) {
  // Update button styles
  document.querySelectorAll('.chart-range').forEach(btn => {
    btn.classList.remove('bg-purple-600');
    btn.classList.add('glass');
  });
  
  event.target.classList.remove('glass');
  event.target.classList.add('bg-purple-600');
  
  renderMachineChart(days);
}

async function loadMachineHistory() {
  if (!currentMachine) return;
  
  try {
    const sets = await db.sets.where('machineId').equals(currentMachine.id).reverse().toArray();
    const sessions = await db.sessions.toArray();
    const sessionMap = new Map(sessions.map(s => [s.id, s]));
    
    const historyContainer = document.getElementById('machine-history');
    
    if (sets.length === 0) {
      historyContainer.innerHTML = `
        <div class="glass rounded-xl p-4 text-center">
          <p class="text-gray-400">No sets recorded yet</p>
          <button onclick="showAddSetModal()" class="mt-3 px-4 py-2 bg-purple-600 rounded-lg">
            Log Your First Set
          </button>
        </div>
      `;
      return;
    }
    
    // Group sets by session/date
    const setsBySession = new Map();
    sets.forEach(set => {
      const session = sessionMap.get(set.sessionId);
      if (session) {
        if (!setsBySession.has(session.date)) {
          setsBySession.set(session.date, []);
        }
        setsBySession.get(session.date).push(set);
      }
    });
    
    const sortedDates = Array.from(setsBySession.keys()).sort().reverse();
    
    historyContainer.innerHTML = `
      <div class="space-y-4">
        <h3 class="text-lg font-semibold">Workout History</h3>
        ${sortedDates.slice(0, 10).map(date => {
          const dateSets = setsBySession.get(date).sort((a, b) => a.order - b.order);
          return `
            <div class="glass rounded-xl p-4">
              <h4 class="font-medium mb-3">${formatDate(date)}</h4>
              <div class="space-y-2">
                ${dateSets.map(set => {
                  const weightDisplay = convertWeight(set.weightKg, appSettings.unit);
                  const epley = set.weightKg * (1 + set.reps / 30);
                  const brzycki = set.weightKg * 36 / (37 - set.reps);
                  const e1rm = Math.max(epley, brzycki);
                  const e1rmDisplay = convertWeight(e1rm, appSettings.unit);
                  
                  return `
                    <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div class="flex-1">
                        <div class="font-medium">
                          ${weightDisplay.toFixed(1)} ${appSettings.unit} × ${set.reps}
                          ${set.rpe ? ` @ RPE ${set.rpe}` : ''}
                        </div>
                        <div class="text-sm text-gray-400">
                          e1RM: ${e1rmDisplay.toFixed(1)} ${appSettings.unit}
                        </div>
                        ${set.notes ? `<div class="text-sm text-gray-300 mt-1">${set.notes}</div>` : ''}
                      </div>
                      <div class="flex space-x-2 ml-3">
                        <button onclick="showEditSetModal(${set.id})" class="p-1 text-gray-400 hover:text-white">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                          </svg>
                        </button>
                        <button onclick="confirmDeleteSet(${set.id})" class="p-1 text-red-400 hover:text-red-300">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Failed to load machine history:', error);
  }
}

// Modal management
function showAddMachineModal() {
  editingMachine = null;
  document.getElementById('machine-modal-title').textContent = 'Add Machine';
  document.getElementById('machine-form').reset();
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('machine-modal').classList.remove('hidden');
}

function showEditMachineModal() {
  if (!currentMachine) return;
  
  editingMachine = currentMachine;
  document.getElementById('machine-modal-title').textContent = 'Edit Machine';
  document.getElementById('machine-label').value = currentMachine.label;
  document.getElementById('machine-muscle-group').value = currentMachine.muscleGroup || '';
  
  if (currentMachine.imageThumb) {
    const preview = document.getElementById('photo-preview');
    const img = document.getElementById('preview-img');
    img.src = URL.createObjectURL(currentMachine.imageThumb);
    preview.classList.remove('hidden');
  } else {
    document.getElementById('photo-preview').classList.add('hidden');
  }
  
  document.getElementById('machine-modal').classList.remove('hidden');
}

function showAddSetModal() {
  if (!currentMachine) return;
  
  editingSet = null;
  document.getElementById('set-modal-title').textContent = 'Log Set';
  document.getElementById('set-form').reset();
  document.getElementById('set-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('set-modal').classList.remove('hidden');
}

async function showEditSetModal(setId) {
  try {
    const set = await db.sets.get(setId);
    const session = await db.sessions.get(set.sessionId);
    
    if (!set || !session) return;
    
    editingSet = set;
    document.getElementById('set-modal-title').textContent = 'Edit Set';
    document.getElementById('set-date').value = session.date;
    document.getElementById('set-weight').value = convertWeight(set.weightKg, appSettings.unit).toFixed(1);
    document.getElementById('set-reps').value = set.reps;
    document.getElementById('set-rpe').value = set.rpe || '';
    document.getElementById('set-notes').value = set.notes || '';
    
    document.getElementById('set-modal').classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load set for editing:', error);
    showToast('Failed to load set', 'error');
  }
}

function closeModals() {
  document.querySelectorAll('[id$="-modal"]').forEach(modal => {
    modal.classList.add('hidden');
  });
  
  // Clean up object URLs
  document.querySelectorAll('img[src^="blob:"]').forEach(img => {
    URL.revokeObjectURL(img.src);
  });
}

// Form handlers
async function handleMachineSubmit(e) {
  e.preventDefault();
  
  try {
    const formData = new FormData(e.target);
    const label = document.getElementById('machine-label').value.trim();
    const muscleGroup = document.getElementById('machine-muscle-group').value.trim();
    const photoFile = document.getElementById('machine-photo').files[0];
    
    if (!label) {
      showToast('Machine name is required', 'error');
      return;
    }
    
    let imageFull = null;
    let imageThumb = null;
    
    if (photoFile) {
      try {
        const images = await processImage(photoFile);
        imageFull = images.full;
        imageThumb = images.thumb;
      } catch (error) {
        console.error('Image processing failed:', error);
        showToast('Failed to process image', 'error');
        return;
      }
    } else if (editingMachine) {
      // Keep existing images
      imageFull = editingMachine.imageFull;
      imageThumb = editingMachine.imageThumb;
    }
    
    const machineData = {
      label,
      muscleGroup: muscleGroup || null,
      imageFull,
      imageThumb,
      updatedAt: new Date()
    };
    
    if (editingMachine) {
      await db.machines.update(editingMachine.id, machineData);
      showToast('Machine updated successfully');
      
      // Update current machine if viewing
      if (currentMachine && currentMachine.id === editingMachine.id) {
        currentMachine = { ...currentMachine, ...machineData };
        loadMachineDetail();
      }
    } else {
      machineData.createdAt = new Date();
      await db.machines.add(machineData);
      showToast('Machine added successfully');
    }
    
    closeModals();
    loadMachines();
  } catch (error) {
    console.error('Failed to save machine:', error);
    showToast('Failed to save machine', 'error');
  }
}

async function handleSetSubmit(e) {
  e.preventDefault();
  
  try {
    const date = document.getElementById('set-date').value;
    const weight = parseFloat(document.getElementById('set-weight').value);
    const reps = parseInt(document.getElementById('set-reps').value);
    const rpe = document.getElementById('set-rpe').value ? parseFloat(document.getElementById('set-rpe').value) : null;
    const notes = document.getElementById('set-notes').value.trim() || null;
    
    if (!date || !weight || !reps || weight <= 0 || reps <= 0) {
      showToast('Please fill in all required fields with valid values', 'error');
      return;
    }
    
    if (rpe && (rpe < 1 || rpe > 10)) {
      showToast('RPE must be between 1 and 10', 'error');
      return;
    }
    
    // Convert weight to kg for storage
    const weightKg = convertWeight(weight, appSettings.unit, true);
    
    // Find or create session
    let session = await db.sessions.where('date').equals(date).first();
    if (!session) {
      session = await db.sessions.add({ date });
      session = { id: session, date };
    }
    
    if (editingSet) {
      // Update existing set
      await db.sets.update(editingSet.id, {
        weightKg,
        reps,
        rpe,
        notes
      });
      showToast('Set updated successfully');
    } else {
      // Calculate order for new set
      const existingSets = await db.sets
        .where('[sessionId+machineId]')
        .equals([session.id, currentMachine.id])
        .toArray();
      const order = existingSets.length + 1;
      
      // Add new set
      await db.sets.add({
        sessionId: session.id,
        machineId: currentMachine.id,
        order,
        weightKg,
        reps,
        rpe,
        notes
      });
      showToast('Set logged successfully');
    }
    
    closeModals();
    if (currentScreen === 'machine-detail') {
      loadMachineDetail();
    }
  } catch (error) {
    console.error('Failed to save set:', error);
    showToast('Failed to save set', 'error');
  }
}

// Image processing
async function processImage(file) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      try {
        // Calculate dimensions for full image (max 1280px)
        let { width: fullWidth, height: fullHeight } = img;
        const maxFull = 1280;
        
        if (fullWidth > maxFull || fullHeight > maxFull) {
          const ratio = Math.min(maxFull / fullWidth, maxFull / fullHeight);
          fullWidth = Math.round(fullWidth * ratio);
          fullHeight = Math.round(fullHeight * ratio);
        }
        
        // Create full image
        canvas.width = fullWidth;
        canvas.height = fullHeight;
        ctx.drawImage(img, 0, 0, fullWidth, fullHeight);
        
        canvas.toBlob(async (fullBlob) => {
          // Create thumbnail (96px)
          const thumbSize = 96;
          const ratio = Math.min(thumbSize / img.width, thumbSize / img.height);
          const thumbWidth = Math.round(img.width * ratio);
          const thumbHeight = Math.round(img.height * ratio);
          
          canvas.width = thumbWidth;
          canvas.height = thumbHeight;
          ctx.clearRect(0, 0, thumbWidth, thumbHeight);
          ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
          
          canvas.toBlob((thumbBlob) => {
            resolve({
              full: fullBlob,
              thumb: thumbBlob
            });
          }, 'image/webp', 0.85);
        }, 'image/webp', 0.9);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function previewPhoto(e) {
  const file = e.target.files[0];
  if (file) {
    const preview = document.getElementById('photo-preview');
    const img = document.getElementById('preview-img');
    
    // Clean up previous URL
    if (img.src && img.src.startsWith('blob:')) {
      URL.revokeObjectURL(img.src);
    }
    
    img.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
  } else {
    document.getElementById('photo-preview').classList.add('hidden');
  }
}

// Confirmation dialogs
function confirmDeleteMachine() {
  showConfirm(
    'Are you sure you want to delete this machine? This will also delete all associated workout sets.',
    async () => {
      try {
        await db.sets.where('machineId').equals(currentMachine.id).delete();
        await db.machines.delete(currentMachine.id);
        showToast('Machine deleted successfully');
        showScreen('machines');
      } catch (error) {
        console.error('Failed to delete machine:', error);
        showToast('Failed to delete machine', 'error');
      }
    }
  );
}

function confirmDeleteSet(setId) {
  showConfirm(
    'Are you sure you want to delete this set?',
    async () => {
      try {
        await db.sets.delete(setId);
        showToast('Set deleted successfully');
        loadMachineDetail();
      } catch (error) {
        console.error('Failed to delete set:', error);
        showToast('Failed to delete set', 'error');
      }
    }
  );
}

function showConfirm(message, onConfirm) {
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-btn').onclick = () => {
    closeModals();
    onConfirm();
  };
  document.getElementById('confirm-modal').classList.remove('hidden');
}

// Settings management
function updateUnitButtons() {
  const kgBtn = document.getElementById('unit-kg');
  const lbBtn = document.getElementById('unit-lb');
  
  if (appSettings.unit === 'kg') {
    kgBtn.classList.add('bg-purple-600', 'text-white');
    kgBtn.classList.remove('glass', 'text-gray-300');
    lbBtn.classList.add('glass', 'text-gray-300');
    lbBtn.classList.remove('bg-purple-600', 'text-white');
  } else {
    lbBtn.classList.add('bg-purple-600', 'text-white');
    lbBtn.classList.remove('glass', 'text-gray-300');
    kgBtn.classList.add('glass', 'text-gray-300');
    kgBtn.classList.remove('bg-purple-600', 'text-white');
  }
}

function updateWeightUnits() {
  const weightUnit = document.getElementById('weight-unit');
  if (weightUnit) {
    weightUnit.textContent = appSettings.unit;
  }
}

async function setUnit(unit) {
  try {
    appSettings.unit = unit;
    await db.settings.update('app', { unit });
    updateUnitButtons();
    updateWeightUnits();
    showToast(`Units changed to ${unit.toUpperCase()}`);
    
    // Refresh current screen to show updated units
    if (currentScreen === 'machine-detail') {
      loadMachineDetail();
    }
  } catch (error) {
    console.error('Failed to update unit setting:', error);
    showToast('Failed to update units', 'error');
  }
}

// Data management
async function exportData() {
  try {
    const [machines, sessions, sets, settings] = await Promise.all([
      db.machines.toArray(),
      db.sessions.toArray(),
      db.sets.toArray(),
      db.settings.toArray()
    ]);
    
    // Convert image blobs to data URLs for export
    const machinesWithImages = await Promise.all(
      machines.map(async machine => {
        const exported = { ...machine };
        
        if (machine.imageFull) {
          exported.imageFull = await blobToDataURL(machine.imageFull);
        }
        if (machine.imageThumb) {
          exported.imageThumb = await blobToDataURL(machine.imageThumb);
        }
        
        return exported;
      })
    );
    
    const exportData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      machines: machinesWithImages,
      sessions,
      sets,
      settings
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `gymnote-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    
    // Update last backup time
    await db.settings.update('app', { lastBackupAt: new Date().toISOString() });
    
    showToast('Data exported successfully');
  } catch (error) {
    console.error('Failed to export data:', error);
    showToast('Failed to export data', 'error');
  }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.version || !data.machines || !data.sessions || !data.sets) {
      throw new Error('Invalid backup file format');
    }
    
    showConfirm(
      `Import ${data.machines.length} machines, ${data.sessions.length} sessions, and ${data.sets.length} sets? This will merge with existing data.`,
      async () => {
        try {
          // Create ID mapping for remapping foreign keys
          const machineIdMap = new Map();
          const sessionIdMap = new Map();
          
          // Import machines with new IDs
          for (const machine of data.machines) {
            const machineToImport = { ...machine };
            
            // Convert data URLs back to blobs
            if (machine.imageFull && typeof machine.imageFull === 'string') {
              machineToImport.imageFull = await dataURLToBlob(machine.imageFull);
            }
            if (machine.imageThumb && typeof machine.imageThumb === 'string') {
              machineToImport.imageThumb = await dataURLToBlob(machine.imageThumb);
            }
            
            delete machineToImport.id; // Let DB assign new ID
            const newId = await db.machines.add(machineToImport);
            machineIdMap.set(machine.id, newId);
          }
          
          // Import sessions with new IDs
          for (const session of data.sessions) {
            const sessionToImport = { ...session };
            delete sessionToImport.id; // Let DB assign new ID
            const newId = await db.sessions.add(sessionToImport);
            sessionIdMap.set(session.id, newId);
          }
          
          // Import sets with remapped IDs
          for (const set of data.sets) {
            const setToImport = { ...set };
            setToImport.machineId = machineIdMap.get(set.machineId);
            setToImport.sessionId = sessionIdMap.get(set.sessionId);
            
            if (setToImport.machineId && setToImport.sessionId) {
              delete setToImport.id; // Let DB assign new ID
              await db.sets.add(setToImport);
            }
          }
          
          showToast('Data imported successfully');
          loadMachines();
          event.target.value = ''; // Clear file input
        } catch (error) {
          console.error('Failed to import data:', error);
          showToast('Failed to import data', 'error');
        }
      }
    );
  } catch (error) {
    console.error('Failed to parse import file:', error);
    showToast('Invalid backup file', 'error');
  }
  
  event.target.value = ''; // Clear file input
}

function clearAllData() {
  showConfirm(
    'Are you sure you want to clear ALL data? This cannot be undone!',
    async () => {
      try {
        await Promise.all([
          db.machines.clear(),
          db.sessions.clear(),
          db.sets.clear()
        ]);
        
        showToast('All data cleared successfully');
        currentMachine = null;
        showScreen('machines');
      } catch (error) {
        console.error('Failed to clear data:', error);
        showToast('Failed to clear data', 'error');
      }
    }
  );
}

// Utility functions
function convertWeight(weight, unit, toKg = false) {
  if (toKg) {
    // Convert from display unit to kg
    return unit === 'lb' ? weight * 0.453592 : weight;
  } else {
    // Convert from kg to display unit
    return unit === 'lb' ? weight * 2.20462 : weight;
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function dataURLToBlob(dataURL) {
  const response = await fetch(dataURL);
  return await response.blob();
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  
  // Auto dismiss after 1.5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
  }, 1500);
}

// Button press animation
document.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    e.target.classList.add('btn-press');
    setTimeout(() => {
      e.target.classList.remove('btn-press');
    }, 100);
  }
});

// Prevent zoom on double tap for iOS
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, false);