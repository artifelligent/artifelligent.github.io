// store.js — localStorage persistence for GPT Builder projects

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

  // --- Projects ---
  function listProjects() {
    return _read('projects') || [];
  }

  function _saveProjectList(ids) {
    _write('projects', ids);
  }

  function createProject(topic, description) {
    const id = 'proj_' + Date.now();
    const project = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userTopic: topic,
      topicDescription: description,
      currentStage: 'idle',
      stageHistory: [],
      agentOutputs: {},
      hitlNotes: {},
      userEdits: {},
      searchResults: null,
      revisions: []
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
    project.agentOutputs[agentName] = output;
    saveProject(project);
    return project;
  }

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

  return {
    getApiKey, setApiKey, clearApiKey,
    getProvider, setProvider,
    listProjects, createProject, loadProject, saveProject, deleteProject,
    updateStage, completeStage, updateAgentOutput,
    getStorageUsage
  };
})();
