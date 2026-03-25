// store.js — localStorage persistence for GPT Builder projects
// Supports version history, scratchpad, cost tracking, and GitHub Gist sync

const store = (() => {
  const PREFIX = 'gptBuilder_';

  function _read(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('store: read error', key, e);
      return null;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.error('store: write error', key, e);
      if (e.name === 'QuotaExceededError') {
        alert('localStorage is full. Please delete old projects to free space.');
      }
    }
  }

  function _remove(key) {
    localStorage.removeItem(PREFIX + key);
  }

  // --- API Key ---
  function getApiKey() { return _read('apiKey'); }
  function setApiKey(key) { _write('apiKey', key); }
  function clearApiKey() { _remove('apiKey'); }

  function getProvider() { return _read('provider') || 'openai'; }
  function setProvider(p) { _write('provider', p); }

  // --- GitHub Gist Token ---
  function getGistToken() { return _read('gistToken'); }
  function setGistToken(token) { _write('gistToken', token); }
  function clearGistToken() { _remove('gistToken'); }

  // --- Settings ---
  function getSettings() {
    return _read('settings') || {
      autoApprove: false,
      onboardingDone: false,
      tooltipTourDone: false
    };
  }
  function saveSettings(settings) { _write('settings', settings); }

  // --- Projects ---
  function listProjects() {
    return _read('projects') || [];
  }

  function _saveProjectList(ids) {
    _write('projects', ids);
  }

  function createProject(intakeData) {
    const id = 'proj_' + Date.now();
    const project = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // Intake data from the LLM-powered wizard
      intake: intakeData, // { topic, audience, tone, mustHaves, avoid, additionalContext, rawConversation }

      // Pipeline state
      currentStage: 'idle',
      stageHistory: [],

      // Agent outputs (populated as pipeline progresses)
      agentOutputs: {},

      // Version history: array of { version, timestamp, agentName, output, changedBy }
      versionHistory: [],

      // Shared scratchpad for inter-agent communication
      scratchpad: [],

      // HITL data
      hitlNotes: {},
      userEdits: {},

      // Guardrail categories selected by user for this project
      guardrailCategories: ['topic_boundaries'], // default

      // Search results (raw)
      searchResults: null,

      // Cost tracking
      costTracking: {
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalCalls: 0,
        estimatedCostUsd: 0,
        callLog: [] // { agent, tokensIn, tokensOut, costUsd, timestamp, model }
      },

      // Revision history
      revisions: [],

      // Sharing
      gistId: null,       // GitHub Gist ID if synced
      shareToken: null     // generated token for read-only sharing
    };
    _write('project_' + id, project);
    const ids = listProjects();
    ids.push(id);
    _saveProjectList(ids);
    return project;
  }

  function loadProject(id) {
    return _read('project_' + id);
  }

  function saveProject(project) {
    project.updatedAt = new Date().toISOString();
    _write('project_' + project.id, project);
  }

  function deleteProject(id) {
    _remove('project_' + id);
    const ids = listProjects().filter(pid => pid !== id);
    _saveProjectList(ids);
  }

  function updateStage(id, newStage) {
    const project = loadProject(id);
    if (!project) return;
    project.currentStage = newStage;
    project.stageHistory.push({
      stage: newStage,
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null
    });
    saveProject(project);
    return project;
  }

  function completeStage(id) {
    const project = loadProject(id);
    if (!project) return;
    const last = project.stageHistory[project.stageHistory.length - 1];
    if (last) {
      last.completedAt = new Date().toISOString();
      last.durationMs = new Date(last.completedAt) - new Date(last.startedAt);
    }
    saveProject(project);
    return project;
  }

  function updateAgentOutput(id, agentName, output) {
    const project = loadProject(id);
    if (!project) return;
    // Save to version history before overwriting
    if (project.agentOutputs[agentName]) {
      project.versionHistory.push({
        version: project.versionHistory.filter(v => v.agentName === agentName).length + 1,
        timestamp: new Date().toISOString(),
        agentName,
        output: JSON.parse(JSON.stringify(project.agentOutputs[agentName])),
        changedBy: 'agent'
      });
    }
    project.agentOutputs[agentName] = output;
    saveProject(project);
    return project;
  }

  // --- Scratchpad ---
  function addScratchpadEntry(id, agentName, note) {
    const project = loadProject(id);
    if (!project) return;
    project.scratchpad.push({
      agent: agentName,
      note,
      timestamp: new Date().toISOString()
    });
    saveProject(project);
    return project;
  }

  function getScratchpad(id) {
    const project = loadProject(id);
    return project?.scratchpad || [];
  }

  // --- Cost Tracking ---
  function logApiCall(id, agent, tokensIn, tokensOut, model) {
    const project = loadProject(id);
    if (!project) return;
    const pricing = _getModelPricing(model);
    const costUsd = (tokensIn / 1000000) * pricing.input + (tokensOut / 1000000) * pricing.output;
    project.costTracking.totalTokensIn += tokensIn;
    project.costTracking.totalTokensOut += tokensOut;
    project.costTracking.totalCalls += 1;
    project.costTracking.estimatedCostUsd += costUsd;
    project.costTracking.callLog.push({
      agent, tokensIn, tokensOut, costUsd: Math.round(costUsd * 10000) / 10000,
      timestamp: new Date().toISOString(), model
    });
    saveProject(project);
    return project;
  }

  function _getModelPricing(model) {
    // Approximate pricing per 1M tokens (USD)
    const prices = {
      'gpt-4o':      { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'o3-mini':     { input: 1.10, output: 4.40 }
    };
    return prices[model] || prices['gpt-4o'];
  }

  // --- Version History ---
  function getVersionHistory(id, agentName) {
    const project = loadProject(id);
    if (!project) return [];
    return project.versionHistory.filter(v => v.agentName === agentName);
  }

  function revertToVersion(id, agentName, versionIndex) {
    const project = loadProject(id);
    if (!project) return;
    const versions = project.versionHistory.filter(v => v.agentName === agentName);
    if (versionIndex >= 0 && versionIndex < versions.length) {
      // Save current as new version entry
      project.versionHistory.push({
        version: versions.length + 1,
        timestamp: new Date().toISOString(),
        agentName,
        output: JSON.parse(JSON.stringify(project.agentOutputs[agentName])),
        changedBy: 'revert'
      });
      project.agentOutputs[agentName] = JSON.parse(JSON.stringify(versions[versionIndex].output));
      saveProject(project);
    }
    return project;
  }

  // --- GitHub Gist Sync ---
  async function saveToGist(id) {
    const token = getGistToken();
    if (!token) throw new Error('GitHub token not configured. Add it in settings.');
    const project = loadProject(id);
    if (!project) throw new Error('Project not found');

    const payload = {
      description: `GPT Builder: ${project.intake?.topic || 'Untitled'}`,
      public: false,
      files: {
        'gpt-builder-project.json': {
          content: JSON.stringify(project, null, 2)
        }
      }
    };

    const url = project.gistId
      ? `https://api.github.com/gists/${project.gistId}`
      : 'https://api.github.com/gists';
    const method = project.gistId ? 'PATCH' : 'POST';

    const resp = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`Gist save failed: ${resp.status}`);
    const data = await resp.json();
    project.gistId = data.id;
    saveProject(project);
    return data;
  }

  async function loadFromGist(gistId) {
    const token = getGistToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const resp = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
    if (!resp.ok) throw new Error(`Gist load failed: ${resp.status}`);
    const data = await resp.json();
    const file = data.files['gpt-builder-project.json'];
    if (!file) throw new Error('Not a valid GPT Builder gist');
    const project = JSON.parse(file.content);
    // Import as a new local project
    const newId = 'proj_' + Date.now();
    project.id = newId;
    project.gistId = gistId;
    _write('project_' + newId, project);
    const ids = listProjects();
    ids.push(newId);
    _saveProjectList(ids);
    return project;
  }

  // --- Storage Usage ---
  function getStorageUsage() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) {
        total += localStorage.getItem(key).length * 2; // UTF-16
      }
    }
    return total;
  }

  // --- Demo Project ---
  function getDemoProject() {
    return {
      id: 'demo',
      createdAt: '2026-03-24T10:00:00Z',
      updatedAt: '2026-03-24T10:15:00Z',
      intake: {
        topic: 'Personal Finance for College Students',
        audience: 'US college students aged 18-24',
        tone: 'Friendly, approachable, avoids jargon',
        mustHaves: 'Budgeting basics, student loan guidance, beginner investing',
        avoid: 'Complex derivatives, day trading, tax optimization for high earners',
        additionalContext: 'Should emphasize practical, actionable steps with small dollar amounts'
      },
      currentStage: 'complete',
      stageHistory: [],
      agentOutputs: {
        researcher: {
          gptBestPractices: [
            { category: 'System Prompt', practice: 'Start with clear role definition', details: 'Define who the GPT is, its expertise, and boundaries in the first paragraph.' },
            { category: 'Knowledge Files', practice: 'Use structured Markdown', details: 'Headings, lists, and tables are parsed more effectively than plain prose.' },
            { category: 'Guardrails', practice: 'Explicit boundary instructions', details: 'Tell the GPT exactly what topics to redirect away from.' }
          ],
          topicGlossary: [
            { term: 'FAFSA', definition: 'Free Application for Federal Student Aid — the form students fill out to qualify for federal financial aid.' },
            { term: 'Compound Interest', definition: 'Interest earned on both the principal and previously accumulated interest.' },
            { term: 'Roth IRA', definition: 'A retirement account funded with after-tax dollars; withdrawals in retirement are tax-free.' }
          ],
          userIntents: [
            { intent: 'Create a monthly budget', example: 'How do I make a budget on $1,200/month?', priority: 'high' },
            { intent: 'Understand student loans', example: 'Should I pay off my loans early or invest?', priority: 'high' },
            { intent: 'Start investing small', example: 'Can I invest with just $50/month?', priority: 'medium' }
          ],
          domainBoundaries: {
            inScope: ['Budgeting', 'Student loans', 'Basic investing', 'Saving strategies', 'Credit building'],
            outOfScope: ['Tax law advice', 'Complex trading', 'Cryptocurrency speculation', 'Insurance products']
          },
          keyFacts: [
            { fact: 'Average student loan debt is ~$37,000', context: 'As of 2025, for bachelor\'s degree graduates in the US.' },
            { fact: 'The 50/30/20 rule', context: 'A popular budgeting framework: 50% needs, 30% wants, 20% savings.' }
          ],
          misconceptions: [
            { myth: 'You need a lot of money to start investing', reality: 'Many platforms allow starting with $1-5 through fractional shares.' },
            { myth: 'All debt is bad', reality: 'Strategic debt (like federal student loans with low rates) can be a reasonable tool when managed properly.' }
          ]
        },
        personaDesigner: {
          name: 'CampusCash',
          description: 'Your friendly college money mentor — helping students budget, manage loans, and start investing with confidence.',
          systemPrompt: 'You are CampusCash, a friendly and knowledgeable personal finance assistant designed specifically for college students...',
          conversationStarters: [
            'Help me create a monthly budget on my part-time job income',
            'Explain my student loan repayment options in simple terms',
            'How can I start investing with just $25/month?',
            'What\'s the best way to build credit as a student?'
          ],
          guardrails: {
            do: ['Use simple, jargon-free language', 'Provide actionable steps with specific examples', 'Add disclaimers for financial decisions'],
            dont: ['Give specific tax advice', 'Recommend individual stocks', 'Encourage risky financial behavior']
          }
        },
        knowledgeCurator: {
          faqDocument: '# CampusCash FAQ\\n\\nQ: How do I create a budget?\\nA: Start with the 50/30/20 rule...',
          referenceGuide: '# Personal Finance Reference Guide\\n\\n## Budgeting Basics\\n...',
          edgeCases: '# Edge Cases & Tricky Scenarios\\n\\n## "Should I drop out to save money?"\\n...',
          quickReference: '# Quick Reference Card\\n\\n| Topic | Key Point |\\n|---|---|\\n| Budget | 50/30/20 rule |...'
        },
        validator: {
          testResults: [
            { query: 'How do I make a budget?', category: 'easy', simulatedResponse: 'Great question! Let\'s use the 50/30/20 rule...', scores: { accuracy: 5, helpfulness: 5, toneConsistency: 5, guardrailCompliance: 5 }, issues: [] },
            { query: 'Should I invest in Bitcoin?', category: 'edge_case', simulatedResponse: 'I focus on foundational investing strategies rather than specific cryptocurrency recommendations...', scores: { accuracy: 4, helpfulness: 4, toneConsistency: 5, guardrailCompliance: 5 }, issues: [] },
            { query: 'Help me file my taxes', category: 'out_of_scope', simulatedResponse: 'Tax filing is outside my area of expertise! I\'d recommend...', scores: { accuracy: 5, helpfulness: 4, toneConsistency: 5, guardrailCompliance: 5 }, issues: [] }
          ],
          gaps: ['Could add more content about credit card churning risks', 'Missing info about work-study programs'],
          recommendations: ['Add a section about emergency funds', 'Include more examples with real dollar amounts'],
          overallScore: 4
        }
      },
      scratchpad: [
        { agent: 'Scout', note: 'Topic has strong overlap with general personal finance — need to keep focus on college-specific scenarios.', timestamp: '2026-03-24T10:02:00Z' },
        { agent: 'Architect', note: 'Chose casual tone with mentor personality — test audience research suggests students respond better to peer-like voice than authoritative.', timestamp: '2026-03-24T10:06:00Z' }
      ],
      hitlNotes: {},
      userEdits: {},
      guardrailCategories: ['topic_boundaries', 'disclaimer_compliance'],
      searchResults: { bestPractices: 'cached', topicResearch: 'llm_knowledge' },
      costTracking: { totalTokensIn: 12450, totalTokensOut: 8320, totalCalls: 6, estimatedCostUsd: 0.12, callLog: [] },
      revisions: [],
      versionHistory: [],
      gistId: null,
      shareToken: null
    };
  }

  return {
    getApiKey, setApiKey, clearApiKey,
    getProvider, setProvider,
    getGistToken, setGistToken, clearGistToken,
    getSettings, saveSettings,
    listProjects, createProject, loadProject, saveProject, deleteProject,
    updateStage, completeStage, updateAgentOutput,
    addScratchpadEntry, getScratchpad,
    logApiCall,
    getVersionHistory, revertToVersion,
    saveToGist, loadFromGist,
    getStorageUsage,
    getDemoProject
  };
})();
