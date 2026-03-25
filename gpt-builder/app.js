// app.js — UI rendering, event binding, orchestration kickoff
// Written in chunks. Chunk 1: Core scaffolding, settings, sidebar, project list, activity log

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM References ---
  const mainContent = document.getElementById('mainContent');
  const sidebarSteps = document.querySelectorAll('.pipeline-step');
  const apiKeyIndicator = document.getElementById('apiKeyIndicator');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const settingsClose = document.getElementById('settingsClose');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const providerSelect = document.getElementById('providerSelect');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const clearKeyBtn = document.getElementById('clearKeyBtn');
  const connectionStatus = document.getElementById('connectionStatus');
  const projectList = document.getElementById('projectList');
  const newProjectBtn = document.getElementById('newProjectBtn');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const activityLogEl = document.getElementById('activityLog');
  const costTracker = document.getElementById('costTracker');
  const costAmount = document.getElementById('costAmount');
  const callCount = document.getElementById('callCount');
  const autoApproveToggle = document.getElementById('autoApproveToggle');
  const gistSaveBtn = document.getElementById('gistSaveBtn');
  const gistLoadBtn = document.getElementById('gistLoadBtn');
  const gistTokenInput = document.getElementById('gistTokenInput');

  // --- State ---
  const STAGES = pipeline.STAGES;
  let currentProject = null;

  // --- Activity Log Handler ---
  api.setActivityHandler((entry) => {
    const div = document.createElement('div');
    div.className = `log-entry log-${entry.type} fade-in`;
    const time = new Date(entry.timestamp).toLocaleTimeString();
    div.textContent = `[${time}] ${entry.agent}: ${entry.message}`;
    activityLogEl.appendChild(div);
    activityLogEl.scrollTop = activityLogEl.scrollHeight;
  });

  // --- Cost Tracker Updates ---
  function updateCostDisplay() {
    if (!currentProject) { costTracker.classList.add('hidden'); return; }
    const proj = store.loadProject(currentProject.id);
    if (!proj || !proj.costTracking) { costTracker.classList.add('hidden'); return; }
    const cost = proj.costTracking;
    if (cost.totalCalls > 0) {
      costTracker.classList.remove('hidden');
      costAmount.textContent = '$' + cost.estimatedCostUsd.toFixed(4);
      callCount.textContent = cost.totalCalls;
    }
  }

  // --- Auto-Approve Toggle ---
  const settings = store.getSettings();
  autoApproveToggle.checked = settings.autoApprove || false;
  autoApproveToggle.addEventListener('change', () => {
    const s = store.getSettings();
    s.autoApprove = autoApproveToggle.checked;
    store.saveSettings(s);
  });

  // --- Init ---
  updateApiKeyIndicator();
  renderProjectList();
  loadLastProject();

  // --- Settings Modal ---
  settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = store.getApiKey() || '';
    providerSelect.value = store.getProvider();
    gistTokenInput.value = store.getGistToken() || '';
    connectionStatus.textContent = '';
    connectionStatus.className = 'text-sm mt-2';
    settingsModal.classList.remove('hidden');
  });

  settingsClose.addEventListener('click', () => settingsModal.classList.add('hidden'));
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  saveSettingsBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) { alert('Please enter an API key.'); return; }
    store.setApiKey(key);
    store.setProvider(providerSelect.value);
    const gistToken = gistTokenInput.value.trim();
    if (gistToken) store.setGistToken(gistToken);
    else store.clearGistToken();
    updateApiKeyIndicator();
    settingsModal.classList.add('hidden');
  });

  clearKeyBtn.addEventListener('click', () => {
    store.clearApiKey();
    apiKeyInput.value = '';
    updateApiKeyIndicator();
    connectionStatus.textContent = 'API key cleared.';
    connectionStatus.className = 'text-sm mt-2 text-gray-600';
  });

  testConnectionBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { alert('Enter an API key first.'); return; }
    store.setApiKey(key);
    store.setProvider(providerSelect.value);
    connectionStatus.textContent = 'Testing...';
    connectionStatus.className = 'text-sm mt-2 text-blue-600';
    testConnectionBtn.disabled = true;
    try {
      await api.testConnection();
      connectionStatus.textContent = 'Connection successful!';
      connectionStatus.className = 'text-sm mt-2 text-green-600';
    } catch (e) {
      connectionStatus.textContent = `Failed: ${e.message}`;
      connectionStatus.className = 'text-sm mt-2 text-red-600';
    }
    testConnectionBtn.disabled = false;
  });

  // --- Sidebar Toggle (mobile) ---
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('-translate-x-full');
    });
  }

  // --- New Project ---
  newProjectBtn.addEventListener('click', () => {
    currentProject = null;
    pipeline.setCurrentProjectId(null);
    api.clearActivityLog();
    activityLogEl.innerHTML = '<div class="log-entry log-info p-2 text-gray-400">Waiting to start...</div>';
    costTracker.classList.add('hidden');
    renderIdleView();
    updateStepper('idle');
    renderProjectList();
  });

  // --- Gist Sync ---
  gistSaveBtn.addEventListener('click', async () => {
    if (!currentProject) { alert('No project selected.'); return; }
    if (!store.getGistToken()) { alert('Add a GitHub token in settings first.'); return; }
    gistSaveBtn.textContent = 'Saving...';
    gistSaveBtn.disabled = true;
    try {
      const data = await store.saveToGist(currentProject.id);
      gistSaveBtn.textContent = 'Saved!';
      setTimeout(() => { gistSaveBtn.textContent = 'Save to GitHub Gist'; gistSaveBtn.disabled = false; }, 2000);
    } catch (e) {
      alert('Gist save failed: ' + e.message);
      gistSaveBtn.textContent = 'Save to GitHub Gist';
      gistSaveBtn.disabled = false;
    }
  });

  gistLoadBtn.addEventListener('click', async () => {
    const gistId = prompt('Enter the Gist ID to load:');
    if (!gistId) return;
    gistLoadBtn.textContent = 'Loading...';
    gistLoadBtn.disabled = true;
    try {
      const project = await store.loadFromGist(gistId.trim());
      currentProject = project;
      pipeline.setCurrentProjectId(project.id);
      updateStepper(project.currentStage);
      renderStage(project.currentStage, project);
      renderProjectList();
      gistLoadBtn.textContent = 'Loaded!';
      setTimeout(() => { gistLoadBtn.textContent = 'Load from Gist'; gistLoadBtn.disabled = false; }, 2000);
    } catch (e) {
      alert('Gist load failed: ' + e.message);
      gistLoadBtn.textContent = 'Load from Gist';
      gistLoadBtn.disabled = false;
    }
  });

  // --- Pipeline Stage Change Handler ---
  pipeline.setStageChangeHandler((stage, project) => {
    currentProject = project;
    updateStepper(stage);
    updateCostDisplay();
    renderStage(stage, project);
  });

  // --- Sidebar: Stepper ---
  function updateStepper(currentStage) {
    const stageOrder = [
      'idle', 'interviewing', 'searching', 'researching', 'hitl_research_review',
      'designing_persona', 'hitl_persona_review', 'curating_knowledge', 'hitl_config_review',
      'validating', 'hitl_results_review', 'complete'
    ];
    const currentIdx = stageOrder.indexOf(currentStage);

    sidebarSteps.forEach(step => {
      const stepStage = step.dataset.stage;
      const stepIdx = stageOrder.indexOf(stepStage);
      const icon = step.querySelector('.step-icon');

      step.classList.remove('text-blue-600', 'text-green-600', 'text-gray-400');
      icon.classList.remove('bg-blue-600', 'bg-green-600', 'bg-gray-300', 'bg-yellow-500');
      icon.innerHTML = '';

      if (stepIdx < currentIdx) {
        step.classList.add('text-green-600');
        icon.classList.add('bg-green-600');
        icon.innerHTML = '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
      } else if (stepIdx === currentIdx) {
        if (currentStage.startsWith('hitl_')) {
          step.classList.add('text-blue-600');
          icon.classList.add('bg-yellow-500');
          icon.innerHTML = '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="4"/></svg>';
        } else {
          step.classList.add('text-blue-600');
          icon.classList.add('bg-blue-600');
          if (currentStage === 'complete') {
            icon.innerHTML = '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
          } else {
            icon.innerHTML = '<div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>';
          }
        }
      } else {
        step.classList.add('text-gray-400');
        icon.classList.add('bg-gray-300');
      }
    });
  }

  // --- Sidebar: Project List ---
  function renderProjectList() {
    const ids = store.listProjects();
    if (ids.length === 0) {
      projectList.innerHTML = '<p class="text-xs text-gray-400 px-2">No projects yet</p>';
      return;
    }
    projectList.innerHTML = ids.slice().reverse().map(id => {
      const p = store.loadProject(id);
      if (!p) return '';
      const isActive = currentProject?.id === id;
      const topic = p.intake?.topic || p.userTopic || 'Untitled';
      return `<button class="project-item w-full text-left px-2 py-1.5 rounded text-sm truncate ${isActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'}" data-id="${id}">
        ${esc(topic)}
        <span class="block text-xs text-gray-400">${p.currentStage}</span>
      </button>`;
    }).join('');

    projectList.querySelectorAll('.project-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const project = store.loadProject(id);
        if (project) {
          currentProject = project;
          pipeline.setCurrentProjectId(id);
          updateStepper(project.currentStage);
          updateCostDisplay();
          renderStage(project.currentStage, project);
          renderProjectList();
        }
      });
    });
  }

  // --- API Key Indicator ---
  function updateApiKeyIndicator() {
    const hasKey = !!store.getApiKey();
    apiKeyIndicator.className = `w-2.5 h-2.5 rounded-full ${hasKey ? 'bg-green-500' : 'bg-red-500'}`;
    apiKeyIndicator.title = hasKey ? 'API key configured' : 'No API key set';
  }

  // --- Load last project or show idle ---
  function loadLastProject() {
    const s = store.getSettings();
    // Check for demo project on first visit
    if (!s.onboardingDone) {
      loadDemoProject();
      if (!s.tooltipTourDone) runTooltipTour();
      return;
    }
    const ids = store.listProjects();
    if (ids.length > 0) {
      const lastId = ids[ids.length - 1];
      const project = store.loadProject(lastId);
      if (project && project.currentStage !== 'idle') {
        currentProject = project;
        pipeline.setCurrentProjectId(lastId);
        updateStepper(project.currentStage);
        updateCostDisplay();
        renderStage(project.currentStage, project);
        renderProjectList();
        return;
      }
    }
    renderIdleView();
  }

  // --- Demo Project ---
  function loadDemoProject() {
    const demo = store.getDemoProject();
    // Store it temporarily for viewing (not in project list)
    currentProject = demo;
    updateStepper(demo.currentStage);
    renderStage(demo.currentStage, demo);
    const s = store.getSettings();
    s.onboardingDone = true;
    store.saveSettings(s);
  }

  // --- Tooltip Tour ---
  function runTooltipTour() {
    const overlay = document.getElementById('tooltipOverlay');
    const title = document.getElementById('tooltipTitle');
    const text = document.getElementById('tooltipText');
    const progress = document.getElementById('tooltipProgress');
    const nextBtn = document.getElementById('tooltipNext');
    const skipBtn = document.getElementById('tooltipSkip');

    const steps = [
      { title: 'Welcome to GPT Builder!', text: 'This tool uses a team of AI agents to help you create custom GPTs. Each agent has a specialty — research, design, knowledge curation, and quality testing.' },
      { title: 'The Pipeline', text: 'The left sidebar shows your progress through the pipeline. Each step is handled by a different agent with its own personality and expertise.' },
      { title: 'Your API Key', text: 'Click the gear icon to add your OpenAI API key. The agents will use it to do their work. Your key never leaves your browser except to call OpenAI directly.' },
      { title: 'Auto-Approve Mode', text: 'The "Auto" toggle skips review checkpoints and lets agents run the full pipeline without stopping. Great once you trust the process.' },
      { title: 'Demo Project', text: 'You\'re looking at a demo project right now. Click "+ New" in the sidebar to start building your own GPT!' }
    ];

    let currentStep = 0;

    function showStep(idx) {
      title.textContent = steps[idx].title;
      text.textContent = steps[idx].text;
      progress.textContent = `${idx + 1} of ${steps.length}`;
      nextBtn.textContent = idx === steps.length - 1 ? 'Get Started' : 'Next';
    }

    function close() {
      overlay.classList.add('hidden');
      const s = store.getSettings();
      s.tooltipTourDone = true;
      store.saveSettings(s);
    }

    overlay.classList.remove('hidden');
    showStep(0);

    nextBtn.addEventListener('click', () => {
      currentStep++;
      if (currentStep >= steps.length) { close(); return; }
      showStep(currentStep);
    });

    skipBtn.addEventListener('click', close);
  }

  // --- Utility: HTML escape ---
  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function slugify(str) {
    return (str || 'gpt').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40);
  }

  function collapsibleSection(title, content, openByDefault) {
    return `
      <details class="collapsible-section border rounded-md mb-3" ${openByDefault ? 'open' : ''}>
        <summary class="p-3 cursor-pointer hover:bg-gray-50 font-medium text-sm">${title}</summary>
        <div class="p-3 border-t">${content}</div>
      </details>`;
  }

  function agentBadge(charKey) {
    const chars = agents.getCharacters();
    const c = chars[charKey];
    if (!c) return '';
    const colors = { blue: 'bg-blue-100', purple: 'bg-purple-100', green: 'bg-green-100', orange: 'bg-orange-100', teal: 'bg-teal-100' };
    return `<div class="flex items-center gap-2 mb-3">
      <div class="agent-avatar ${colors[c.color] || 'bg-gray-100'}">${c.avatar}</div>
      <div><div class="font-semibold text-sm">${c.name}</div><div class="text-xs text-gray-500">${c.subtitle}</div></div>
    </div>`;
  }

  // --- Stage Router ---
  function renderStage(stage, project) {
    switch (stage) {
      case STAGES.IDLE: renderIdleView(); break;
      case STAGES.INTERVIEWING: renderInterviewView(project); break;
      case STAGES.SEARCHING: renderProgressView('Scout', 'scout', 'Searching for GPT best practices...', 'Querying the web for the latest guidance on building custom GPTs.'); break;
      case STAGES.RESEARCHING: renderProgressView('Scout', 'scout', 'Analyzing your topic...', 'The Topic Researcher agent is studying your subject area and gathering domain knowledge.'); break;
      case STAGES.HITL_RESEARCH_REVIEW: renderResearchReview(project); break;
      case STAGES.DESIGNING_PERSONA: renderProgressView('Architect', 'architect', 'Designing GPT persona...', 'The Persona Designer agent is crafting your GPT\'s system prompt, personality, and guardrails.'); break;
      case STAGES.HITL_PERSONA_REVIEW: renderPersonaReview(project); break;
      case STAGES.CURATING_KNOWLEDGE: renderProgressView('Librarian', 'librarian', 'Curating knowledge base...', 'The Knowledge Curator agent is building structured documents for your GPT.'); break;
      case STAGES.HITL_CONFIG_REVIEW: renderConfigReview(project); break;
      case STAGES.VALIDATING: renderProgressView('Inspector', 'inspector', 'Running QA validation...', 'The Validator agent is testing your GPT configuration with simulated queries and conversations.'); break;
      case STAGES.HITL_RESULTS_REVIEW: renderResultsReview(project); break;
      case STAGES.COMPLETE: renderComplete(project); break;
      case STAGES.REVISING: renderProgressView('Architect', 'architect', 'Revising configuration...', 'Re-running agents with your feedback.'); break;
      case STAGES.ERROR: renderError(project); break;
      default: renderIdleView();
    }
  }

  // =====================================================================
  // PLACEHOLDER FUNCTIONS — will be implemented in subsequent chunks
  // =====================================================================

  // Chunk 2: Intake wizard
  function renderIdleView() {
    const hasKey = !!store.getApiKey();
    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-bold mb-2">Build a Custom GPT</h2>
          <p class="text-gray-600 mb-6">Our team of AI agents will interview you about your idea, then research, design, curate knowledge, and validate a complete GPT configuration.</p>
          ${!hasKey ? '<div class="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4 text-sm text-yellow-800">Please configure your API key in settings before starting.</div>' : ''}
          <button id="startWizardBtn" class="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition-colors font-medium ${!hasKey ? 'opacity-50 cursor-not-allowed' : ''}" ${!hasKey ? 'disabled' : ''}>
            Start Building
          </button>
          <p class="text-xs text-gray-400 mt-3 text-center">Guide will ask you a few questions to understand what GPT you want to build.</p>
        </div>
      </div>`;
    const btn = document.getElementById('startWizardBtn');
    if (btn && hasKey) {
      btn.addEventListener('click', () => {
        // Placeholder — chunk 2 will implement the full wizard
        mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">Intake wizard loading... (chunk 2)</p></div>';
      });
    }
  }

  function renderInterviewView(project) {
    mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">Interview view — chunk 2</p></div>';
  }

  // Chunk 3: Progress view
  function renderProgressView(agentName, charKey, title, subtitle) {
    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6">
          ${agentBadge(charKey)}
          <div class="text-center py-8">
            <div class="inline-block mb-4">
              <div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600"></div>
            </div>
            <h2 class="text-lg font-semibold mb-1">${title}</h2>
            <p class="text-gray-500 text-sm">${subtitle}</p>
          </div>
          <div class="bg-gray-50 rounded-lg p-3 mt-4">
            <div class="text-xs font-medium text-gray-400 mb-1">Live Activity</div>
            <div id="inlineActivityLog" class="activity-log bg-white border rounded text-xs" style="max-height:150px">
              <div class="log-entry log-info p-1 text-gray-400">Starting...</div>
            </div>
          </div>
        </div>
      </div>`;

    // Mirror activity log entries to the inline log
    const inlineLog = document.getElementById('inlineActivityLog');
    if (inlineLog) {
      // Copy existing recent entries
      const existing = api.getActivityLog().slice(-10);
      existing.forEach(entry => {
        const div = document.createElement('div');
        div.className = `log-entry log-${entry.type} p-1`;
        div.textContent = `[${new Date(entry.timestamp).toLocaleTimeString()}] ${entry.agent}: ${entry.message}`;
        inlineLog.appendChild(div);
      });
    }
  }

  // Chunk 4: HITL checkpoints 1 & 2
  function renderResearchReview(project) {
    mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">Research review — chunk 4</p></div>';
  }

  function renderPersonaReview(project) {
    mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">Persona review — chunk 4</p></div>';
  }

  // Chunk 5: HITL checkpoints 3 & 4
  function renderConfigReview(project) {
    mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">Knowledge review — chunk 5</p></div>';
  }

  function renderResultsReview(project) {
    mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">Results review — chunk 5</p></div>';
  }

  // Chunk 6: Complete view with guided export
  function renderComplete(project) {
    mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">Complete view — chunk 6</p></div>';
  }

  // Chunk 3: Error view
  function renderError(project) {
    const msg = project?.lastError || 'An unknown error occurred.';
    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto text-center py-16">
        <div class="text-red-500 text-5xl mb-4">!</div>
        <h2 class="text-xl font-semibold mb-2">Something went wrong</h2>
        <p class="text-gray-600 mb-4">${esc(msg)}</p>
        <div class="flex gap-3 justify-center">
          <button id="retryBtn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">Retry</button>
          <button id="backToStartBtn" class="border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors text-gray-700">Start Over</button>
        </div>
      </div>`;
    document.getElementById('retryBtn')?.addEventListener('click', () => {
      if (currentProject) pipeline.start(currentProject.id);
    });
    document.getElementById('backToStartBtn')?.addEventListener('click', () => {
      currentProject = null;
      pipeline.setCurrentProjectId(null);
      renderIdleView();
      updateStepper('idle');
    });
  }

}); // End DOMContentLoaded
