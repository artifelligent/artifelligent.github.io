// app.js — UI rendering, event binding, orchestration kickoff

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

  // --- State ---
  const STAGES = pipeline.STAGES;
  let currentProject = null;

  // --- Init ---
  updateApiKeyIndicator();
  renderProjectList();
  loadLastProject();

  // --- Settings Modal ---
  settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = store.getApiKey() || '';
    providerSelect.value = store.getProvider();
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
    renderIdleView();
    updateStepper('idle');
    renderProjectList();
  });

  // --- Pipeline Stage Change Handler ---
  pipeline.setStageChangeHandler((stage, project) => {
    currentProject = project;
    updateStepper(stage);
    renderStage(stage, project);
  });

  // --- Stage Rendering ---
  function renderStage(stage, project) {
    switch (stage) {
      case STAGES.IDLE: renderIdleView(); break;
      case STAGES.SEARCHING: renderProgressView('Searching for GPT best practices...', 'Querying the web for the latest guidance on building custom GPTs.'); break;
      case STAGES.RESEARCHING: renderProgressView('Analyzing your topic...', 'The Topic Researcher agent is studying your subject area and gathering domain knowledge.'); break;
      case STAGES.HITL_RESEARCH_REVIEW: renderResearchReview(project); break;
      case STAGES.DESIGNING_PERSONA: renderProgressView('Designing GPT persona...', 'The Persona Designer agent is crafting your GPT\'s system prompt, personality, and guardrails.'); break;
      case STAGES.CURATING_KNOWLEDGE: renderProgressView('Curating knowledge base...', 'The Knowledge Curator agent is building structured documents for your GPT.'); break;
      case STAGES.HITL_CONFIG_REVIEW: renderConfigReview(project); break;
      case STAGES.VALIDATING: renderProgressView('Running QA validation...', 'The Validator agent is testing your GPT configuration with simulated queries.'); break;
      case STAGES.COMPLETE: renderComplete(project); break;
      case STAGES.REVISING: renderProgressView('Revising configuration...', 'Re-running agents with your feedback.'); break;
      case STAGES.ERROR: renderError(project); break;
    }
  }

  // --- Idle View (Input Form) ---
  function renderIdleView() {
    const hasKey = !!store.getApiKey();
    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-bold mb-2">Build a Custom GPT</h2>
          <p class="text-gray-600 mb-6">Describe the GPT you want to create, and our multi-agent pipeline will research the topic, design a system prompt, curate knowledge documents, and validate the configuration.</p>
          ${!hasKey ? '<div class="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4 text-sm text-yellow-800">Please configure your API key in settings before starting.</div>' : ''}
          <div class="space-y-4">
            <div>
              <label for="topicInput" class="block text-sm font-medium text-gray-700 mb-1">Topic</label>
              <input type="text" id="topicInput" class="w-full border border-gray-300 rounded-md p-2" placeholder="e.g., Personal Finance for College Students" />
            </div>
            <div>
              <label for="descInput" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea id="descInput" class="w-full border border-gray-300 rounded-md p-2 h-32" placeholder="Describe the GPT's purpose, target audience, and any specific requirements or preferences..."></textarea>
            </div>
            <button id="startBtn" class="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition-colors font-medium ${!hasKey ? 'opacity-50 cursor-not-allowed' : ''}" ${!hasKey ? 'disabled' : ''}>
              Start Building
            </button>
          </div>
        </div>
      </div>`;

    const startBtn = document.getElementById('startBtn');
    if (startBtn && hasKey) {
      startBtn.addEventListener('click', () => {
        const topic = document.getElementById('topicInput').value.trim();
        const desc = document.getElementById('descInput').value.trim();
        if (!topic) { alert('Please enter a topic.'); return; }
        const project = store.createProject(topic, desc || topic);
        currentProject = project;
        pipeline.setCurrentProjectId(project.id);
        renderProjectList();
        pipeline.start(project.id);
      });
    }
  }

  // --- Progress View ---
  function renderProgressView(title, subtitle) {
    mainContent.innerHTML = `
      <div class="max-w-2xl mx-auto text-center py-16">
        <div class="inline-block mb-6">
          <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
        </div>
        <h2 class="text-xl font-semibold mb-2">${title}</h2>
        <p class="text-gray-500">${subtitle}</p>
        <div class="mt-8 bg-gray-100 rounded-lg p-4">
          <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full bg-blue-600 rounded-full animate-pulse" style="width: 60%"></div>
          </div>
        </div>
      </div>`;
  }

  // --- HITL 1: Research Review ---
  function renderResearchReview(project) {
    const r = project.agentOutputs.researcher;
    if (!r) { renderError(project); return; }

    const practicesHtml = (r.gptBestPractices || []).map(p =>
      `<li class="mb-2"><strong>${esc(p.category)}:</strong> ${esc(p.practice)} <span class="text-gray-500 text-sm">— ${esc(p.details)}</span></li>`
    ).join('');

    const glossaryHtml = (r.topicGlossary || []).map(g =>
      `<li class="mb-1"><strong>${esc(g.term)}:</strong> ${esc(g.definition)}</li>`
    ).join('');

    const intentsHtml = (r.userIntents || []).map(i =>
      `<li class="mb-1"><span class="inline-block px-2 py-0.5 text-xs rounded ${i.priority === 'high' ? 'bg-red-100 text-red-700' : i.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}">${esc(i.priority)}</span> ${esc(i.intent)} <span class="text-gray-500 text-sm">— "${esc(i.example)}"</span></li>`
    ).join('');

    const inScopeHtml = (r.domainBoundaries?.inScope || []).map(s => `<li>${esc(s)}</li>`).join('');
    const outScopeHtml = (r.domainBoundaries?.outOfScope || []).map(s => `<li>${esc(s)}</li>`).join('');

    const factsHtml = (r.keyFacts || []).map(f =>
      `<li class="mb-1"><strong>${esc(f.fact)}</strong> <span class="text-gray-500 text-sm">— ${esc(f.context)}</span></li>`
    ).join('');

    const mythsHtml = (r.misconceptions || []).map(m =>
      `<li class="mb-2"><strong>Myth:</strong> ${esc(m.myth)}<br><strong>Reality:</strong> ${esc(m.reality)}</li>`
    ).join('');

    const searchSource = project.searchResults?.bestPractices || 'unknown';

    mainContent.innerHTML = `
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6 mb-4">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-2xl font-bold">Research Review</h2>
            <span class="text-xs px-2 py-1 rounded ${searchSource === 'web_search' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
              Source: ${searchSource === 'web_search' ? 'Live Web Search' : searchSource === 'cached' ? 'Cached Data' : 'LLM Knowledge'}
            </span>
          </div>
          <p class="text-gray-600 mb-6">Review the research findings below. You can approve them, add notes for the next stage, or re-run the research.</p>

          ${collapsibleSection('GPT Best Practices', `<ul class="list-disc pl-5 space-y-1">${practicesHtml}</ul>`, true)}
          ${collapsibleSection('Topic Glossary', `<ul class="list-disc pl-5">${glossaryHtml}</ul>`)}
          ${collapsibleSection('User Intents', `<ul class="space-y-1">${intentsHtml}</ul>`)}
          ${collapsibleSection('Domain Boundaries', `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><h4 class="font-medium text-green-700 mb-1">In Scope</h4><ul class="list-disc pl-5">${inScopeHtml}</ul></div>
              <div><h4 class="font-medium text-red-700 mb-1">Out of Scope</h4><ul class="list-disc pl-5">${outScopeHtml}</ul></div>
            </div>`)}
          ${collapsibleSection('Key Facts', `<ul class="list-disc pl-5">${factsHtml}</ul>`)}
          ${collapsibleSection('Common Misconceptions', `<ul class="space-y-2">${mythsHtml}</ul>`)}
        </div>

        <div class="bg-white rounded-lg shadow-md p-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">Notes for the next stage (optional)</label>
          <textarea id="hitlNotes" class="w-full border border-gray-300 rounded-md p-2 h-24" placeholder="Add corrections, emphasis, or additional context..."></textarea>
          <div class="flex gap-3 mt-4">
            <button id="approveResearchBtn" class="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors font-medium">Approve & Continue</button>
            <button id="rerunResearchBtn" class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-gray-700">Re-run Research</button>
          </div>
        </div>
      </div>`;

    // Bind collapsible toggles
    bindCollapsibles();

    document.getElementById('approveResearchBtn').addEventListener('click', () => {
      const notes = document.getElementById('hitlNotes').value.trim();
      pipeline.approveResearch(notes || null);
    });

    document.getElementById('rerunResearchBtn').addEventListener('click', () => {
      if (confirm('This will re-run the research phase. Continue?')) {
        pipeline.rerunResearch();
      }
    });
  }

  // --- HITL 2: Config Review ---
  function renderConfigReview(project) {
    const persona = project.agentOutputs.personaDesigner;
    const knowledge = project.agentOutputs.knowledgeCurator;
    if (!persona || !knowledge) { renderError(project); return; }

    mainContent.innerHTML = `
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6 mb-4">
          <h2 class="text-2xl font-bold mb-1">${esc(persona.name)}</h2>
          <p class="text-gray-600 mb-4">${esc(persona.description)}</p>

          <!-- Tab Bar -->
          <div class="border-b border-gray-200 mb-4">
            <nav class="flex gap-4" id="configTabs">
              <button class="config-tab pb-2 border-b-2 border-blue-600 text-blue-600 font-medium text-sm" data-tab="systemPrompt">System Prompt</button>
              <button class="config-tab pb-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700 text-sm" data-tab="knowledge">Knowledge Docs</button>
              <button class="config-tab pb-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700 text-sm" data-tab="starters">Starters & Guardrails</button>
            </nav>
          </div>

          <!-- Tab Panels -->
          <div id="tabSystemPrompt" class="config-panel">
            <p class="text-sm text-gray-500 mb-2">You can edit the system prompt directly before validation.</p>
            <textarea id="systemPromptEdit" class="w-full border border-gray-300 rounded-md p-3 font-mono text-sm" style="min-height: 400px">${esc(persona.systemPrompt)}</textarea>
          </div>

          <div id="tabKnowledge" class="config-panel hidden">
            ${collapsibleSection('FAQ Document', `<pre class="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">${esc(knowledge.faqDocument)}</pre>`, true)}
            ${collapsibleSection('Reference Guide', `<pre class="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">${esc(knowledge.referenceGuide)}</pre>`)}
            ${collapsibleSection('Edge Cases', `<pre class="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">${esc(knowledge.edgeCases)}</pre>`)}
            ${collapsibleSection('Quick Reference', `<pre class="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">${esc(knowledge.quickReference)}</pre>`)}
          </div>

          <div id="tabStarters" class="config-panel hidden">
            <h3 class="font-medium mb-2">Conversation Starters</h3>
            <ul class="space-y-2 mb-6">
              ${(persona.conversationStarters || []).map((s, i) =>
                `<li class="flex items-center gap-2"><span class="text-blue-600 font-medium">${i + 1}.</span> <span class="bg-blue-50 px-3 py-1 rounded-full text-sm">${esc(s)}</span></li>`
              ).join('')}
            </ul>
            <h3 class="font-medium mb-2">Guardrails</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 class="text-sm font-medium text-green-700 mb-1">Do</h4>
                <ul class="list-disc pl-5 text-sm space-y-1">${(persona.guardrails?.do || []).map(g => `<li>${esc(g)}</li>`).join('')}</ul>
              </div>
              <div>
                <h4 class="text-sm font-medium text-red-700 mb-1">Don't</h4>
                <ul class="list-disc pl-5 text-sm space-y-1">${(persona.guardrails?.dont || []).map(g => `<li>${esc(g)}</li>`).join('')}</ul>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-6">
          <div class="flex gap-3">
            <button id="approveConfigBtn" class="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors font-medium">Approve & Validate</button>
            <button id="requestChangesBtn" class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-gray-700">Request Changes</button>
          </div>
          <div id="changesInputArea" class="hidden mt-4">
            <textarea id="changesInput" class="w-full border border-gray-300 rounded-md p-2 h-24" placeholder="Describe what you'd like changed..."></textarea>
            <button id="submitChangesBtn" class="mt-2 bg-orange-500 text-white px-4 py-2 rounded-md hover:bg-orange-600 transition-colors text-sm">Submit Changes</button>
          </div>
        </div>
      </div>`;

    // Tab switching
    document.querySelectorAll('.config-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.config-tab').forEach(t => {
          t.classList.remove('border-blue-600', 'text-blue-600', 'font-medium');
          t.classList.add('border-transparent', 'text-gray-500');
        });
        tab.classList.add('border-blue-600', 'text-blue-600', 'font-medium');
        tab.classList.remove('border-transparent', 'text-gray-500');
        document.querySelectorAll('.config-panel').forEach(p => p.classList.add('hidden'));
        const tabName = tab.dataset.tab;
        if (tabName === 'systemPrompt') document.getElementById('tabSystemPrompt').classList.remove('hidden');
        else if (tabName === 'knowledge') document.getElementById('tabKnowledge').classList.remove('hidden');
        else if (tabName === 'starters') document.getElementById('tabStarters').classList.remove('hidden');
      });
    });

    bindCollapsibles();

    document.getElementById('approveConfigBtn').addEventListener('click', () => {
      const editedPrompt = document.getElementById('systemPromptEdit').value;
      const original = persona.systemPrompt;
      pipeline.approveConfig(editedPrompt !== original ? editedPrompt : null);
    });

    document.getElementById('requestChangesBtn').addEventListener('click', () => {
      document.getElementById('changesInputArea').classList.toggle('hidden');
    });

    document.getElementById('submitChangesBtn').addEventListener('click', () => {
      const feedback = document.getElementById('changesInput').value.trim();
      if (!feedback) { alert('Please describe the changes you want.'); return; }
      pipeline.requestConfigChanges(feedback);
    });
  }

  // --- Complete View ---
  function renderComplete(project) {
    const v = project.agentOutputs.validator;
    const persona = project.agentOutputs.personaDesigner;
    const knowledge = project.agentOutputs.knowledgeCurator;
    if (!v) { renderError(project); return; }

    const scoreColor = v.overallScore >= 4 ? 'text-green-600' : v.overallScore >= 3 ? 'text-yellow-600' : 'text-red-600';
    const scoreBg = v.overallScore >= 4 ? 'bg-green-50' : v.overallScore >= 3 ? 'bg-yellow-50' : 'bg-red-50';

    const testRowsHtml = (v.testResults || []).map(t => {
      const avgScore = ((t.scores.accuracy + t.scores.helpfulness + t.scores.toneConsistency + t.scores.guardrailCompliance) / 4).toFixed(1);
      const catColor = t.category === 'out_of_scope' ? 'bg-red-100 text-red-700' : t.category === 'edge_case' ? 'bg-yellow-100 text-yellow-700' : t.category === 'hard' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700';
      return `
        <details class="border rounded-md mb-2">
          <summary class="p-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between">
            <span class="flex items-center gap-2">
              <span class="px-2 py-0.5 text-xs rounded ${catColor}">${esc(t.category)}</span>
              <span class="text-sm">${esc(t.query)}</span>
            </span>
            <span class="text-sm font-medium ${parseFloat(avgScore) >= 4 ? 'text-green-600' : parseFloat(avgScore) >= 3 ? 'text-yellow-600' : 'text-red-600'}">${avgScore}/5</span>
          </summary>
          <div class="p-3 border-t bg-gray-50 text-sm">
            <p class="mb-2"><strong>Simulated Response:</strong></p>
            <p class="mb-3 whitespace-pre-wrap">${esc(t.simulatedResponse)}</p>
            <div class="grid grid-cols-4 gap-2 text-xs mb-2">
              <div>Accuracy: <strong>${t.scores.accuracy}/5</strong></div>
              <div>Helpful: <strong>${t.scores.helpfulness}/5</strong></div>
              <div>Tone: <strong>${t.scores.toneConsistency}/5</strong></div>
              <div>Guardrails: <strong>${t.scores.guardrailCompliance}/5</strong></div>
            </div>
            ${t.issues?.length ? `<p class="text-red-600"><strong>Issues:</strong> ${t.issues.map(esc).join('; ')}</p>` : '<p class="text-green-600">No issues found.</p>'}
          </div>
        </details>`;
    }).join('');

    mainContent.innerHTML = `
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-lg shadow-md p-6 mb-4">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-bold">QA Results: ${esc(persona.name)}</h2>
            <div class="${scoreBg} rounded-lg px-4 py-2 text-center">
              <div class="text-3xl font-bold ${scoreColor}">${v.overallScore}/5</div>
              <div class="text-xs text-gray-500">Overall Score</div>
            </div>
          </div>

          <h3 class="font-semibold mb-3">Test Results</h3>
          ${testRowsHtml}

          ${v.gaps?.length ? `
          <h3 class="font-semibold mt-6 mb-2">Knowledge Gaps</h3>
          <ul class="list-disc pl-5 text-sm space-y-1">${v.gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}

          ${v.recommendations?.length ? `
          <h3 class="font-semibold mt-6 mb-2">Recommendations</h3>
          <ul class="list-disc pl-5 text-sm space-y-1">${v.recommendations.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        </div>

        <!-- Export Section -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-4">
          <h3 class="font-semibold mb-4">Export Your GPT Configuration</h3>
          <div class="flex flex-wrap gap-3">
            <button id="exportJsonBtn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm">Download Full Config (JSON)</button>
            <button id="copyPromptBtn" class="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors text-sm">Copy System Prompt</button>
            <button id="exportKnowledgeBtn" class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm">Download Knowledge Files (MD)</button>
          </div>
        </div>

        <!-- Revision -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <button id="reviseBtn" class="w-full border border-orange-400 text-orange-600 py-2 rounded-md hover:bg-orange-50 transition-colors font-medium">Revise Configuration</button>
          <div id="reviseInputArea" class="hidden mt-4">
            <textarea id="reviseInput" class="w-full border border-gray-300 rounded-md p-2 h-24" placeholder="Describe what you'd like changed..."></textarea>
            <button id="submitReviseBtn" class="mt-2 bg-orange-500 text-white px-4 py-2 rounded-md hover:bg-orange-600 transition-colors text-sm">Submit Revision</button>
          </div>
        </div>
      </div>`;

    // Export handlers
    document.getElementById('exportJsonBtn').addEventListener('click', () => exportFullConfig(project));
    document.getElementById('copyPromptBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(persona.systemPrompt).then(() => {
        const btn = document.getElementById('copyPromptBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy System Prompt'; }, 2000);
      });
    });
    document.getElementById('exportKnowledgeBtn').addEventListener('click', () => exportKnowledgeFiles(knowledge, persona.name));

    document.getElementById('reviseBtn').addEventListener('click', () => {
      document.getElementById('reviseInputArea').classList.toggle('hidden');
    });
    document.getElementById('submitReviseBtn').addEventListener('click', () => {
      const feedback = document.getElementById('reviseInput').value.trim();
      if (!feedback) { alert('Please describe what to change.'); return; }
      pipeline.revise(feedback);
    });
  }

  // --- Error View ---
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
    document.getElementById('retryBtn').addEventListener('click', () => {
      if (currentProject) pipeline.start(currentProject.id);
    });
    document.getElementById('backToStartBtn').addEventListener('click', () => {
      currentProject = null;
      pipeline.setCurrentProjectId(null);
      renderIdleView();
      updateStepper('idle');
    });
  }

  // --- Sidebar: Stepper ---
  function updateStepper(currentStage) {
    const stageOrder = ['idle', 'searching', 'researching', 'hitl_research_review', 'designing_persona', 'curating_knowledge', 'hitl_config_review', 'validating', 'complete'];
    const currentIdx = stageOrder.indexOf(currentStage);

    sidebarSteps.forEach(step => {
      const stepStage = step.dataset.stage;
      const stepIdx = stageOrder.indexOf(stepStage);
      const icon = step.querySelector('.step-icon');
      const label = step.querySelector('.step-label');

      step.classList.remove('text-blue-600', 'text-green-600', 'text-gray-400');
      icon.classList.remove('bg-blue-600', 'bg-green-600', 'bg-gray-300', 'bg-yellow-500');
      icon.innerHTML = '';

      if (stepIdx < currentIdx) {
        // Completed
        step.classList.add('text-green-600');
        icon.classList.add('bg-green-600');
        icon.innerHTML = '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
      } else if (stepIdx === currentIdx) {
        // Current
        if (currentStage.startsWith('hitl_')) {
          step.classList.add('text-blue-600');
          icon.classList.add('bg-yellow-500');
          icon.innerHTML = '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="4"/></svg>';
        } else {
          step.classList.add('text-blue-600');
          icon.classList.add('bg-blue-600');
          if (currentStage !== 'complete') {
            icon.innerHTML = '<div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>';
          } else {
            icon.innerHTML = '<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
          }
        }
      } else {
        // Upcoming
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
      return `<button class="project-item w-full text-left px-2 py-1.5 rounded text-sm truncate ${isActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'}" data-id="${id}">
        ${esc(p.userTopic)}
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
          renderStage(project.currentStage, project);
          renderProjectList();
        }
      });
    });
  }

  // --- Export Helpers ---
  function exportFullConfig(project) {
    const config = {
      name: project.agentOutputs.personaDesigner?.name,
      description: project.agentOutputs.personaDesigner?.description,
      systemPrompt: project.agentOutputs.personaDesigner?.systemPrompt,
      conversationStarters: project.agentOutputs.personaDesigner?.conversationStarters,
      guardrails: project.agentOutputs.personaDesigner?.guardrails,
      knowledgeDocuments: project.agentOutputs.knowledgeCurator,
      qaResults: project.agentOutputs.validator,
      metadata: {
        topic: project.userTopic,
        description: project.topicDescription,
        createdAt: project.createdAt,
        pipeline: project.stageHistory
      }
    };
    downloadJSON(config, `gpt-config-${slugify(config.name || project.userTopic)}.json`);
  }

  function exportKnowledgeFiles(knowledge, name) {
    const parts = [];
    if (knowledge.faqDocument) parts.push(`# FAQ Document\n\n${knowledge.faqDocument}`);
    if (knowledge.referenceGuide) parts.push(`# Reference Guide\n\n${knowledge.referenceGuide}`);
    if (knowledge.edgeCases) parts.push(`# Edge Cases\n\n${knowledge.edgeCases}`);
    if (knowledge.quickReference) parts.push(`# Quick Reference\n\n${knowledge.quickReference}`);
    const content = parts.join('\n\n---\n\n');
    downloadText(content, `gpt-knowledge-${slugify(name)}.md`);
  }

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    triggerDownload(blob, filename);
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/markdown' });
    triggerDownload(blob, filename);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // --- Utilities ---
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

  function bindCollapsibles() {
    // Collapsibles are native <details> elements, no JS needed
  }

  function loadLastProject() {
    const ids = store.listProjects();
    if (ids.length > 0) {
      const lastId = ids[ids.length - 1];
      const project = store.loadProject(lastId);
      if (project && project.currentStage !== 'idle') {
        currentProject = project;
        pipeline.setCurrentProjectId(lastId);
        updateStepper(project.currentStage);
        renderStage(project.currentStage, project);
        renderProjectList();
        return;
      }
    }
    renderIdleView();
  }

  function updateApiKeyIndicator() {
    const hasKey = !!store.getApiKey();
    apiKeyIndicator.className = `w-2.5 h-2.5 rounded-full ${hasKey ? 'bg-green-500' : 'bg-red-500'}`;
    apiKeyIndicator.title = hasKey ? 'API key configured' : 'No API key set';
  }
});
