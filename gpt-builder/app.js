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

  // =====================================================================
  // CHUNK 2: Idle View + LLM-Powered Intake Wizard
  // =====================================================================

  function renderIdleView() {
    const hasKey = !!store.getApiKey();
    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6 text-center">
          ${agentBadge('interviewer')}
          <h2 class="text-2xl font-bold mb-2">Build a Custom GPT</h2>
          <p class="text-gray-600 mb-6">Our team of AI agents will interview you about your idea, then research, design, curate knowledge, and validate a complete GPT configuration.</p>
          <div class="flex items-center justify-center gap-6 mb-6 text-sm text-gray-500">
            <div class="flex items-center gap-1"><span class="text-lg">\uD83D\uDD0D</span> Scout</div>
            <div class="flex items-center gap-1"><span class="text-lg">\uD83C\uDFD7\uFE0F</span> Architect</div>
            <div class="flex items-center gap-1"><span class="text-lg">\uD83D\uDCDA</span> Librarian</div>
            <div class="flex items-center gap-1"><span class="text-lg">\uD83D\uDD2C</span> Inspector</div>
          </div>
          ${!hasKey ? '<div class="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4 text-sm text-yellow-800">Please configure your API key in settings before starting.</div>' : ''}
          <button id="startWizardBtn" class="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition-colors font-medium ${!hasKey ? 'opacity-50 cursor-not-allowed' : ''}" ${!hasKey ? 'disabled' : ''}>
            Start Building
          </button>
          <p class="text-xs text-gray-400 mt-3">\uD83D\uDDE3\uFE0F Guide will ask you a few questions to understand what GPT you want to build.</p>
        </div>
      </div>`;
    const btn = document.getElementById('startWizardBtn');
    if (btn && hasKey) {
      btn.addEventListener('click', startIntakeWizard);
    }
  }

  // --- Intake Wizard State ---
  let wizardConversation = []; // { role: 'user'|'assistant', content: string }
  let wizardProjectId = null;
  let wizardBusy = false;

  function startIntakeWizard() {
    wizardConversation = [];
    wizardBusy = false;
    // Create a project stub so we can track costs
    const stub = store.createProject({ topic: '(interviewing)', audience: '', tone: '', mustHaves: '', avoid: '', additionalContext: '' });
    wizardProjectId = stub.id;
    currentProject = stub;
    pipeline.setCurrentProjectId(stub.id);
    store.updateStage(stub.id, 'interviewing');
    updateStepper('interviewing');
    renderProjectList();
    renderWizardUI();
    // Kick off the first agent message
    sendWizardTurn(null);
  }

  function renderInterviewView(project) {
    // Resuming an in-progress interview
    wizardProjectId = project.id;
    wizardConversation = project.intake?.rawConversation || [];
    wizardBusy = false;
    renderWizardUI();
  }

  function renderWizardUI() {
    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto flex flex-col" style="height: calc(100vh - 120px)">
        <div class="bg-white rounded-t-lg shadow-md p-4 flex items-center gap-2 border-b">
          ${agentBadge('interviewer')}
        </div>
        <div id="wizardChat" class="flex-1 overflow-y-auto bg-white px-4 py-3 space-y-3">
          ${wizardConversation.map(msg => chatBubble(msg.role, msg.content)).join('')}
        </div>
        <div class="bg-white rounded-b-lg shadow-md p-3 border-t">
          <div class="flex gap-2">
            <input type="text" id="wizardInput" class="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Type your answer..." />
            <button id="wizardSendBtn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">Send</button>
          </div>
          <div class="flex justify-between mt-2">
            <span id="wizardStatus" class="text-xs text-gray-400"></span>
            <button id="wizardDoneBtn" class="text-xs text-blue-500 hover:text-blue-700 hidden">I'm done, start building &rarr;</button>
          </div>
        </div>
      </div>`;

    const input = document.getElementById('wizardInput');
    const sendBtn = document.getElementById('wizardSendBtn');
    const doneBtn = document.getElementById('wizardDoneBtn');

    // Show done button after at least 2 user messages
    const userMsgCount = wizardConversation.filter(m => m.role === 'user').length;
    if (userMsgCount >= 2) doneBtn.classList.remove('hidden');

    sendBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text || wizardBusy) return;
      input.value = '';
      sendWizardTurn(text);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    doneBtn.addEventListener('click', () => {
      if (wizardBusy) return;
      // Tell the agent we're done
      sendWizardTurn("I'm satisfied with what we've discussed. Please produce the final summary.");
    });

    // Scroll to bottom
    const chat = document.getElementById('wizardChat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  async function sendWizardTurn(userText) {
    wizardBusy = true;
    const chat = document.getElementById('wizardChat');
    const statusEl = document.getElementById('wizardStatus');
    const sendBtn = document.getElementById('wizardSendBtn');
    const doneBtn = document.getElementById('wizardDoneBtn');

    if (sendBtn) sendBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Guide is thinking...';

    // Add user message to conversation (if not the initial kick-off)
    if (userText !== null) {
      wizardConversation.push({ role: 'user', content: userText });
      if (chat) {
        chat.insertAdjacentHTML('beforeend', chatBubble('user', userText));
        chat.scrollTop = chat.scrollHeight;
      }
    }

    try {
      // Build message array for the LLM
      const messages = wizardConversation.map(m => ({ role: m.role, content: m.content }));

      const response = await agents.runInterviewerTurn(messages, wizardProjectId);

      // Check if the response is the final structured JSON
      let parsed = null;
      try {
        parsed = JSON.parse(response.trim());
      } catch (_) {}

      if (parsed && parsed.complete === true) {
        // Interview is done — save intake data and start the pipeline
        wizardConversation.push({ role: 'assistant', content: response });
        const intake = {
          topic: parsed.topic || '(untitled)',
          audience: parsed.audience || '',
          tone: parsed.tone || '',
          mustHaves: parsed.mustHaves || '',
          avoid: parsed.avoid || '',
          additionalContext: parsed.additionalContext || '',
          rawConversation: wizardConversation
        };
        const project = store.loadProject(wizardProjectId);
        project.intake = intake;
        store.saveProject(project);
        currentProject = project;

        // Show a completion message before transitioning
        if (chat) {
          chat.insertAdjacentHTML('beforeend', chatBubble('assistant', `Got it! I have everything I need to build your GPT about "${esc(parsed.topic)}". Starting the pipeline now...`));
          chat.scrollTop = chat.scrollHeight;
        }

        // Brief pause so user can read the message
        await new Promise(r => setTimeout(r, 1500));

        // Start the pipeline
        pipeline.beginAfterIntake();
        return;
      }

      // Normal conversational response
      wizardConversation.push({ role: 'assistant', content: response });
      if (chat) {
        chat.insertAdjacentHTML('beforeend', chatBubble('assistant', response));
        chat.scrollTop = chat.scrollHeight;
      }

      // Save conversation progress
      const project = store.loadProject(wizardProjectId);
      if (project) {
        project.intake = project.intake || {};
        project.intake.rawConversation = wizardConversation;
        store.saveProject(project);
      }

      // Show "done" button after 2+ user messages
      if (doneBtn && wizardConversation.filter(m => m.role === 'user').length >= 2) {
        doneBtn.classList.remove('hidden');
      }

    } catch (e) {
      if (chat) {
        chat.insertAdjacentHTML('beforeend',
          `<div class="fade-in text-center text-sm text-red-500 py-2">Error: ${esc(e.message)}. Please try again.</div>`
        );
      }
    }

    wizardBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    if (statusEl) statusEl.textContent = '';
  }

  function chatBubble(role, content) {
    if (role === 'user') {
      return `<div class="flex justify-end fade-in">
        <div class="chat-bubble-user px-4 py-2 max-w-[80%] text-sm">${esc(content)}</div>
      </div>`;
    }
    return `<div class="flex justify-start gap-2 fade-in">
      <div class="agent-avatar bg-teal-100 flex-shrink-0 text-sm">\uD83D\uDDE3\uFE0F</div>
      <div class="chat-bubble-assistant px-4 py-2 max-w-[80%] text-sm">${esc(content)}</div>
    </div>`;
  }

  // =====================================================================
  // CHUNK 3: Progress View + Error View
  // =====================================================================

  let progressTimer = null;

  function renderProgressView(agentName, charKey, title, subtitle) {
    // Clear any existing timer
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }

    const startTime = Date.now();

    // Map stage to step number for the mini-stepper
    const stageSteps = {
      searching: { num: 1, total: 4, label: 'Searching' },
      researching: { num: 1, total: 4, label: 'Researching' },
      designing_persona: { num: 2, total: 4, label: 'Designing' },
      curating_knowledge: { num: 3, total: 4, label: 'Curating' },
      validating: { num: 4, total: 4, label: 'Validating' },
      revising: { num: 2, total: 4, label: 'Revising' }
    };
    const currentStage = currentProject ? currentProject.currentStage : '';
    const step = stageSteps[currentStage] || { num: 0, total: 4, label: '' };
    const progressPct = step.total > 0 ? Math.round((step.num / step.total) * 100) : 0;

    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6 fade-in">
          ${agentBadge(charKey)}

          <!-- Progress bar -->
          <div class="mb-4">
            <div class="flex justify-between text-xs text-gray-500 mb-1">
              <span>Step ${step.num} of ${step.total}: ${step.label}</span>
              <span id="elapsedTimer">0:00</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div class="bg-blue-600 h-2 rounded-full transition-all duration-500" style="width: ${progressPct}%"></div>
            </div>
          </div>

          <!-- Spinner + Title -->
          <div class="text-center py-6">
            <div class="inline-block mb-4">
              <div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600"></div>
            </div>
            <h2 class="text-lg font-semibold mb-1">${esc(title)}</h2>
            <p class="text-gray-500 text-sm">${esc(subtitle)}</p>
          </div>

          <!-- Live Activity Log -->
          <div class="bg-gray-50 rounded-lg p-3 mt-4">
            <div class="flex justify-between items-center mb-1">
              <div class="text-xs font-medium text-gray-400">Live Activity</div>
              <button id="toggleLogBtn" class="text-xs text-blue-500 hover:text-blue-700">Expand</button>
            </div>
            <div id="inlineActivityLog" class="activity-log bg-white border rounded text-xs overflow-y-auto transition-all duration-300" style="max-height:120px">
              <div class="log-entry log-info p-1 text-gray-400">Starting...</div>
            </div>
          </div>

          <!-- Cancel -->
          <div class="text-center mt-4">
            <button id="cancelPipelineBtn" class="text-xs text-gray-400 hover:text-red-500 transition-colors">Cancel and return to start</button>
          </div>
        </div>
      </div>`;

    // --- Elapsed timer ---
    const timerEl = document.getElementById('elapsedTimer');
    progressTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      if (timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);

    // --- Inline log: seed from existing entries ---
    const inlineLog = document.getElementById('inlineActivityLog');
    if (inlineLog) {
      const existing = api.getActivityLog().slice(-10);
      existing.forEach(entry => appendLogEntry(inlineLog, entry));
    }

    // --- Mirror new entries via MutationObserver on sidebar log ---
    if (activityLogEl && inlineLog) {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1 && node.classList.contains('log-entry')) {
              const clone = node.cloneNode(true);
              clone.className = clone.className.replace(/p-2/g, 'p-1');
              inlineLog.appendChild(clone);
              inlineLog.scrollTop = inlineLog.scrollHeight;
            }
          }
        }
      });
      observer.observe(activityLogEl, { childList: true });

      // Store observer so we can disconnect later
      inlineLog._observer = observer;
    }

    // --- Toggle expand/collapse ---
    const toggleBtn = document.getElementById('toggleLogBtn');
    let expanded = false;
    if (toggleBtn && inlineLog) {
      toggleBtn.addEventListener('click', () => {
        expanded = !expanded;
        inlineLog.style.maxHeight = expanded ? '300px' : '120px';
        toggleBtn.textContent = expanded ? 'Collapse' : 'Expand';
      });
    }

    // --- Cancel button ---
    document.getElementById('cancelPipelineBtn')?.addEventListener('click', () => {
      if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
      if (inlineLog?._observer) inlineLog._observer.disconnect();
      if (currentProject) {
        store.updateStage(currentProject.id, 'idle');
      }
      currentProject = null;
      pipeline.setCurrentProjectId(null);
      updateStepper('idle');
      renderIdleView();
    });
  }

  function appendLogEntry(container, entry) {
    const div = document.createElement('div');
    const typeClass = entry.type === 'error' ? 'text-red-500' : entry.type === 'success' ? 'text-green-600' : 'text-gray-600';
    div.className = `log-entry p-1 ${typeClass}`;
    const time = new Date(entry.timestamp).toLocaleTimeString();
    div.textContent = `[${time}] ${entry.agent || ''}: ${entry.message}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // =====================================================================
  // CHUNK 4: HITL Checkpoint 1 (Research Review) & Checkpoint 2 (Persona Review)
  // =====================================================================

  function renderResearchReview(project) {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    const research = project?.agentOutputs?.researcher;
    if (!research) {
      mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">No research data found.</p></div>';
      return;
    }

    const searchSrc = project.searchResults || {};

    // Build best practices list
    const practicesHtml = (research.gptBestPractices || []).map(p =>
      `<div class="border-l-2 border-blue-300 pl-3 mb-2">
        <div class="text-xs font-semibold text-blue-600">${esc(p.category)}</div>
        <div class="text-sm font-medium">${esc(p.practice)}</div>
        <div class="text-xs text-gray-500">${esc(p.details)}</div>
      </div>`
    ).join('');

    // Build glossary
    const glossaryHtml = (research.topicGlossary || []).map(t =>
      `<div class="mb-1"><span class="font-medium text-sm">${esc(t.term)}:</span> <span class="text-sm text-gray-600">${esc(t.definition)}</span></div>`
    ).join('');

    // Build user intents
    const intentsHtml = (research.userIntents || []).map(i => {
      const badge = i.priority === 'high' ? 'bg-red-100 text-red-700' : i.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600';
      return `<div class="flex items-start gap-2 mb-2">
        <span class="text-xs px-1.5 py-0.5 rounded ${badge} flex-shrink-0">${esc(i.priority)}</span>
        <div><div class="text-sm font-medium">${esc(i.intent)}</div><div class="text-xs text-gray-500">${esc(i.example)}</div></div>
      </div>`;
    }).join('');

    // Domain boundaries
    const inScope = (research.domainBoundaries?.inScope || []).map(s => `<li class="text-sm text-green-700">${esc(s)}</li>`).join('');
    const outScope = (research.domainBoundaries?.outOfScope || []).map(s => `<li class="text-sm text-red-600">${esc(s)}</li>`).join('');

    // Key facts
    const factsHtml = (research.keyFacts || []).map(f =>
      `<div class="mb-1"><span class="text-sm">${esc(f.fact)}</span> <span class="text-xs text-gray-400">${esc(f.context || '')}</span></div>`
    ).join('');

    // Misconceptions
    const mythsHtml = (research.misconceptions || []).map(m =>
      `<div class="mb-2 bg-amber-50 rounded p-2">
        <div class="text-sm"><span class="font-medium text-amber-700">Myth:</span> ${esc(m.myth)}</div>
        <div class="text-sm"><span class="font-medium text-green-700">Reality:</span> ${esc(m.reality)}</div>
      </div>`
    ).join('');

    // Knowledge depth suggestion
    const depthLabel = research.suggestedKnowledgeDepth || 'standard';
    const depthColors = { minimal: 'bg-gray-100 text-gray-700', standard: 'bg-blue-100 text-blue-700', comprehensive: 'bg-purple-100 text-purple-700' };

    mainContent.innerHTML = `
      <div class="max-w-3xl mx-auto fade-in">
        <div class="bg-white rounded-lg shadow-md p-6">
          ${agentBadge('scout')}
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Research Review</h2>
            <span class="text-xs px-2 py-1 rounded ${depthColors[depthLabel] || depthColors.standard}">
              Suggested depth: ${esc(depthLabel)}
            </span>
          </div>
          <p class="text-sm text-gray-500 mb-4">Review the research findings below. You can approve to continue, request changes, or add notes.</p>

          <!-- Source info -->
          <div class="text-xs text-gray-400 mb-4 flex gap-4">
            <span>Best practices: ${esc(searchSrc.bestPractices || 'web')}</span>
            <span>Topic research: ${esc(searchSrc.topicResearch || 'llm')}</span>
          </div>

          ${collapsibleSection('GPT Best Practices (' + (research.gptBestPractices || []).length + ')', practicesHtml, true)}
          ${collapsibleSection('Topic Glossary (' + (research.topicGlossary || []).length + ' terms)', glossaryHtml, false)}
          ${collapsibleSection('User Intents (' + (research.userIntents || []).length + ')', intentsHtml, true)}
          ${collapsibleSection('Domain Boundaries',
            '<div class="grid grid-cols-2 gap-4"><div><div class="text-xs font-semibold text-green-600 mb-1">In Scope</div><ul class="list-disc list-inside">' + inScope + '</ul></div><div><div class="text-xs font-semibold text-red-500 mb-1">Out of Scope</div><ul class="list-disc list-inside">' + outScope + '</ul></div></div>',
            false)}
          ${collapsibleSection('Key Facts (' + (research.keyFacts || []).length + ')', factsHtml, false)}
          ${collapsibleSection('Common Misconceptions (' + (research.misconceptions || []).length + ')', mythsHtml, false)}

          ${research.scratchpadNote ? `<div class="bg-blue-50 border border-blue-200 rounded-md p-3 mt-3 text-sm"><span class="font-medium text-blue-700">Scout's note:</span> ${esc(research.scratchpadNote)}</div>` : ''}

          <!-- Feedback -->
          <div class="mt-5 border-t pt-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes for the next agent (optional)</label>
            <textarea id="researchNotes" class="w-full border border-gray-300 rounded-md p-2 text-sm" rows="2" placeholder="Any corrections, emphasis areas, or things to watch for..."></textarea>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 mt-4">
            <button id="approveResearchBtn" class="flex-1 bg-green-600 text-white py-2 rounded-md hover:bg-green-700 transition-colors font-medium">Approve & Continue</button>
            <button id="rerunResearchBtn" class="border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors text-gray-700">Re-run Research</button>
          </div>
        </div>
      </div>`;

    document.getElementById('approveResearchBtn')?.addEventListener('click', () => {
      const notes = document.getElementById('researchNotes')?.value?.trim() || null;
      disableActions();
      pipeline.approveResearch(notes);
    });

    document.getElementById('rerunResearchBtn')?.addEventListener('click', () => {
      disableActions();
      pipeline.rerunResearch();
    });
  }

  function renderPersonaReview(project) {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    const persona = project?.agentOutputs?.personaDesigner;
    if (!persona) {
      mainContent.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><p class="text-gray-500">No persona data found.</p></div>';
      return;
    }

    // Guardrails
    const doRules = (persona.guardrails?.do || []).map(r => `<li class="text-sm text-green-700">${esc(r)}</li>`).join('');
    const dontRules = (persona.guardrails?.dont || []).map(r => `<li class="text-sm text-red-600">${esc(r)}</li>`).join('');

    // Conversation starters
    const startersHtml = (persona.conversationStarters || []).map(s =>
      `<div class="bg-gray-50 rounded-md px-3 py-2 text-sm border">${esc(s)}</div>`
    ).join('');

    mainContent.innerHTML = `
      <div class="max-w-3xl mx-auto fade-in">
        <div class="bg-white rounded-lg shadow-md p-6">
          ${agentBadge('architect')}
          <h2 class="text-xl font-bold mb-1">Persona Review</h2>
          <p class="text-sm text-gray-500 mb-4">Review and optionally edit the GPT configuration designed by Architect.</p>

          <!-- Name & Description -->
          <div class="mb-4">
            <div class="text-xs font-semibold text-gray-400 uppercase mb-1">GPT Name</div>
            <div class="text-lg font-bold">${esc(persona.name)}</div>
          </div>
          <div class="mb-4">
            <div class="text-xs font-semibold text-gray-400 uppercase mb-1">Description</div>
            <div class="text-sm text-gray-700">${esc(persona.description)}</div>
          </div>

          <!-- System Prompt (editable) -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-1">
              <div class="text-xs font-semibold text-gray-400 uppercase">System Prompt</div>
              <span class="text-xs text-gray-400">${(persona.systemPrompt || '').split(/\s+/).length} words</span>
            </div>
            <textarea id="systemPromptEdit" class="w-full border border-gray-300 rounded-md p-3 text-sm font-mono leading-relaxed" rows="12">${esc(persona.systemPrompt)}</textarea>
          </div>

          <!-- Conversation Starters -->
          ${collapsibleSection('Conversation Starters (' + (persona.conversationStarters || []).length + ')',
            '<div class="space-y-2">' + startersHtml + '</div>', true)}

          <!-- Guardrails -->
          ${collapsibleSection('Behavioral Guardrails',
            '<div class="grid grid-cols-2 gap-4"><div><div class="text-xs font-semibold text-green-600 mb-1">Do</div><ul class="list-disc list-inside space-y-1">' + doRules + '</ul></div><div><div class="text-xs font-semibold text-red-500 mb-1">Don\'t</div><ul class="list-disc list-inside space-y-1">' + dontRules + '</ul></div></div>',
            true)}

          ${persona.scratchpadNote ? `<div class="bg-purple-50 border border-purple-200 rounded-md p-3 mt-3 text-sm"><span class="font-medium text-purple-700">Architect's note:</span> ${esc(persona.scratchpadNote)}</div>` : ''}

          <!-- Request changes -->
          <div class="mt-5 border-t pt-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Request changes (optional)</label>
            <textarea id="personaFeedback" class="w-full border border-gray-300 rounded-md p-2 text-sm" rows="2" placeholder="e.g. Make the tone more casual, add more guardrails about..."></textarea>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 mt-4">
            <button id="approvePersonaBtn" class="flex-1 bg-green-600 text-white py-2 rounded-md hover:bg-green-700 transition-colors font-medium">Approve & Continue</button>
            <button id="revisePersonaBtn" class="border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors text-gray-700">Request Changes</button>
          </div>
        </div>
      </div>`;

    document.getElementById('approvePersonaBtn')?.addEventListener('click', () => {
      const editedPrompt = document.getElementById('systemPromptEdit')?.value?.trim();
      const original = persona.systemPrompt?.trim();
      disableActions();
      // Pass edited prompt only if user actually changed it
      pipeline.approvePersona(editedPrompt !== original ? editedPrompt : null);
    });

    document.getElementById('revisePersonaBtn')?.addEventListener('click', () => {
      const feedback = document.getElementById('personaFeedback')?.value?.trim();
      if (!feedback) {
        document.getElementById('personaFeedback')?.focus();
        return;
      }
      disableActions();
      pipeline.requestPersonaChanges(feedback);
    });
  }

  // --- Utility: disable action buttons after click to prevent double-submit ---
  function disableActions() {
    mainContent.querySelectorAll('button').forEach(btn => {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    });
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

  // --- Error View ---
  function renderError(project) {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    const msg = project?.lastError || 'An unknown error occurred.';
    const stage = project?.currentStage || '';

    // Friendly error categorization
    let hint = '';
    if (msg.includes('401') || msg.includes('Invalid API key')) {
      hint = 'Your API key may be invalid or expired. Check your settings.';
    } else if (msg.includes('429') || msg.includes('rate limit')) {
      hint = 'Rate limit reached. Wait a moment and try again.';
    } else if (msg.includes('network') || msg.includes('fetch')) {
      hint = 'Network error. Check your internet connection.';
    } else if (msg.includes('500') || msg.includes('server')) {
      hint = 'The AI provider is experiencing issues. Try again shortly.';
    }

    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6 text-center fade-in">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>
          </div>
          <h2 class="text-xl font-semibold mb-2">Something went wrong</h2>
          <p class="text-gray-600 mb-2">${esc(msg)}</p>
          ${hint ? `<p class="text-sm text-amber-600 mb-4">${esc(hint)}</p>` : '<div class="mb-4"></div>'}
          <div class="flex gap-3 justify-center">
            <button id="retryBtn" class="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium">Retry</button>
            <button id="backToStartBtn" class="border border-gray-300 px-5 py-2 rounded-md hover:bg-gray-50 transition-colors text-gray-700">Start Over</button>
          </div>
          <div class="mt-4">
            <details class="text-left">
              <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Technical details</summary>
              <pre class="mt-2 text-xs bg-gray-50 rounded p-2 overflow-x-auto text-gray-500">${esc(msg)}\nStage: ${esc(stage)}\nProject: ${esc(project?.id || 'unknown')}</pre>
            </details>
          </div>
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
