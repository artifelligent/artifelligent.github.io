// pipeline.js — Orchestrator: sequencing, handoffs, state transitions, HITL gating

const pipeline = (() => {
  const STAGES = {
    IDLE: 'idle',
    SEARCHING: 'searching',
    RESEARCHING: 'researching',
    HITL_RESEARCH_REVIEW: 'hitl_research_review',
    DESIGNING_PERSONA: 'designing_persona',
    CURATING_KNOWLEDGE: 'curating_knowledge',
    HITL_CONFIG_REVIEW: 'hitl_config_review',
    VALIDATING: 'validating',
    COMPLETE: 'complete',
    REVISING: 'revising',
    ERROR: 'error'
  };

  let currentProjectId = null;
  let onStageChange = null; // callback: (stage, project) => void

  function setStageChangeHandler(handler) {
    onStageChange = handler;
  }

  function _transition(stage) {
    if (!currentProjectId) return;
    const project = store.updateStage(currentProjectId, stage);
    if (onStageChange) onStageChange(stage, project);
    return project;
  }

  function _complete() {
    if (!currentProjectId) return;
    return store.completeStage(currentProjectId);
  }

  function _getProject() {
    return store.loadProject(currentProjectId);
  }

  // --- Pipeline Entry ---
  async function start(projectId) {
    currentProjectId = projectId;
    const project = _getProject();
    if (!project) throw new Error('Project not found');

    // Resume from where we left off
    switch (project.currentStage) {
      case STAGES.IDLE:
        await runSearchPhase();
        break;
      case STAGES.HITL_RESEARCH_REVIEW:
        // Waiting for user — just render the UI
        if (onStageChange) onStageChange(STAGES.HITL_RESEARCH_REVIEW, project);
        break;
      case STAGES.HITL_CONFIG_REVIEW:
        if (onStageChange) onStageChange(STAGES.HITL_CONFIG_REVIEW, project);
        break;
      case STAGES.COMPLETE:
        if (onStageChange) onStageChange(STAGES.COMPLETE, project);
        break;
      default:
        // If we were mid-agent, restart that stage
        await resumeFromStage(project.currentStage);
    }
  }

  async function resumeFromStage(stage) {
    const project = _getProject();
    switch (stage) {
      case STAGES.SEARCHING:
      case STAGES.RESEARCHING:
        await runSearchPhase();
        break;
      case STAGES.DESIGNING_PERSONA:
        await runDesignPhase();
        break;
      case STAGES.CURATING_KNOWLEDGE:
        await runCurationPhase();
        break;
      case STAGES.VALIDATING:
        await runValidationPhase();
        break;
      default:
        if (onStageChange) onStageChange(stage, project);
    }
  }

  // --- Phase 1: Search + Research ---
  async function runSearchPhase() {
    try {
      const project = _getProject();

      // Step 1: Web search for best practices
      _transition(STAGES.SEARCHING);
      const bestPractices = await search.fetchGPTBestPractices();
      _complete();

      // Step 2: Web search for topic
      let topicResearch = null;
      try {
        topicResearch = await search.researchTopic(project.userTopic, project.topicDescription);
      } catch (e) {
        console.warn('Topic web search failed, will use LLM knowledge:', e.message);
      }

      // Step 3: Run researcher agent
      _transition(STAGES.RESEARCHING);
      const researchOutput = await agents.runResearcher(
        project.userTopic,
        project.topicDescription,
        bestPractices.data,
        topicResearch?.data || null
      );
      store.updateAgentOutput(currentProjectId, 'researcher', researchOutput);

      // Save search results for reference
      const proj = _getProject();
      proj.searchResults = { bestPractices: bestPractices.source, topicResearch: topicResearch?.source || 'llm_knowledge' };
      store.saveProject(proj);
      _complete();

      // Transition to HITL checkpoint 1
      _transition(STAGES.HITL_RESEARCH_REVIEW);
    } catch (e) {
      _handleError(e);
    }
  }

  // --- HITL 1: User approves research ---
  async function approveResearch(notes) {
    const project = _getProject();
    if (notes) {
      project.hitlNotes.researchReview = notes;
      store.saveProject(project);
    }
    _complete();
    await runDesignPhase();
  }

  async function rerunResearch() {
    _complete();
    await runSearchPhase();
  }

  // --- Phase 2: Persona Design ---
  async function runDesignPhase() {
    try {
      const project = _getProject();
      const researchOutput = project.agentOutputs.researcher;

      _transition(STAGES.DESIGNING_PERSONA);
      const personaOutput = await agents.runPersonaDesigner(
        researchOutput,
        project.userTopic,
        project.topicDescription,
        project.hitlNotes.researchReview || null
      );
      store.updateAgentOutput(currentProjectId, 'personaDesigner', personaOutput);
      _complete();

      await runCurationPhase();
    } catch (e) {
      _handleError(e);
    }
  }

  // --- Phase 3: Knowledge Curation ---
  async function runCurationPhase() {
    try {
      const project = _getProject();

      _transition(STAGES.CURATING_KNOWLEDGE);
      const knowledgeOutput = await agents.runKnowledgeCurator(
        project.agentOutputs.researcher,
        project.agentOutputs.personaDesigner,
        project.userTopic
      );
      store.updateAgentOutput(currentProjectId, 'knowledgeCurator', knowledgeOutput);
      _complete();

      // Transition to HITL checkpoint 2
      _transition(STAGES.HITL_CONFIG_REVIEW);
    } catch (e) {
      _handleError(e);
    }
  }

  // --- HITL 2: User approves config ---
  async function approveConfig(editedSystemPrompt) {
    if (editedSystemPrompt) {
      const project = _getProject();
      project.userEdits.systemPrompt = editedSystemPrompt;
      // Also update the persona output so validator tests the edited version
      project.agentOutputs.personaDesigner.systemPrompt = editedSystemPrompt;
      store.saveProject(project);
    }
    _complete();
    await runValidationPhase();
  }

  async function requestConfigChanges(feedback) {
    const project = _getProject();
    project.hitlNotes.configReview = feedback;
    store.saveProject(project);
    _complete();
    // Re-run persona designer and knowledge curator with feedback
    await runDesignPhase();
  }

  // --- Phase 4: Validation ---
  async function runValidationPhase() {
    try {
      const project = _getProject();

      _transition(STAGES.VALIDATING);
      const validatorOutput = await agents.runValidator(
        project.agentOutputs.personaDesigner,
        project.agentOutputs.knowledgeCurator,
        project.userTopic
      );
      store.updateAgentOutput(currentProjectId, 'validator', validatorOutput);
      _complete();

      _transition(STAGES.COMPLETE);
    } catch (e) {
      _handleError(e);
    }
  }

  // --- Revision Loop ---
  async function revise(feedback) {
    const project = _getProject();
    project.revisions.push({
      timestamp: new Date().toISOString(),
      feedback,
      agentsRerun: ['personaDesigner', 'knowledgeCurator', 'validator']
    });
    project.hitlNotes.configReview = feedback;
    store.saveProject(project);
    _transition(STAGES.REVISING);
    await runDesignPhase();
  }

  // --- Error Handling ---
  function _handleError(error) {
    console.error('Pipeline error:', error);
    const project = _getProject();
    if (project) {
      project.lastError = error.message;
      store.saveProject(project);
    }
    _transition(STAGES.ERROR);
  }

  function getCurrentProjectId() { return currentProjectId; }
  function setCurrentProjectId(id) { currentProjectId = id; }

  return {
    STAGES,
    start,
    approveResearch,
    rerunResearch,
    approveConfig,
    requestConfigChanges,
    revise,
    setStageChangeHandler,
    getCurrentProjectId,
    setCurrentProjectId
  };
})();
