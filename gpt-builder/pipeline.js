// pipeline.js — Orchestrator: sequencing, handoffs, HITL gating, 4 checkpoints + auto mode

const pipeline = (() => {
  const STAGES = {
    IDLE: 'idle',
    INTERVIEWING: 'interviewing',
    SEARCHING: 'searching',
    RESEARCHING: 'researching',
    HITL_RESEARCH_REVIEW: 'hitl_research_review',
    DESIGNING_PERSONA: 'designing_persona',
    HITL_PERSONA_REVIEW: 'hitl_persona_review',
    CURATING_KNOWLEDGE: 'curating_knowledge',
    HITL_CONFIG_REVIEW: 'hitl_config_review',
    VALIDATING: 'validating',
    HITL_RESULTS_REVIEW: 'hitl_results_review',
    COMPLETE: 'complete',
    REVISING: 'revising',
    ERROR: 'error'
  };

  let currentProjectId = null;
  let onStageChange = null;

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

  function _isAutoApprove() {
    return store.getSettings().autoApprove;
  }

  // --- Pipeline Entry ---
  async function start(projectId) {
    currentProjectId = projectId;
    const project = _getProject();
    if (!project) throw new Error('Project not found');

    // Resume from where we left off
    switch (project.currentStage) {
      case STAGES.IDLE:
      case STAGES.INTERVIEWING:
        if (onStageChange) onStageChange(project.currentStage, project);
        break;
      case STAGES.HITL_RESEARCH_REVIEW:
      case STAGES.HITL_PERSONA_REVIEW:
      case STAGES.HITL_CONFIG_REVIEW:
      case STAGES.HITL_RESULTS_REVIEW:
      case STAGES.COMPLETE:
        if (onStageChange) onStageChange(project.currentStage, project);
        break;
      default:
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

  // --- Begin pipeline after intake is complete ---
  async function beginAfterIntake() {
    await runSearchPhase();
  }

  // --- Phase 1: Search + Research ---
  async function runSearchPhase() {
    try {
      const project = _getProject();

      // Step 1: Web search for best practices
      _transition(STAGES.SEARCHING);
      const bestPractices = await search.fetchGPTBestPractices(currentProjectId);
      _complete();

      // Step 2: Web search for topic
      let topicResearch = null;
      try {
        topicResearch = await search.researchTopic(
          project.intake.topic,
          project.intake.additionalContext || project.intake.topic,
          currentProjectId
        );
      } catch (e) {
        console.warn('Topic web search failed, will use LLM knowledge:', e.message);
      }

      // Step 3: Run researcher agent
      _transition(STAGES.RESEARCHING);
      const researchOutput = await agents.runResearcher(
        project.intake,
        bestPractices.data,
        topicResearch?.data || null,
        currentProjectId
      );
      store.updateAgentOutput(currentProjectId, 'researcher', researchOutput);

      // Save search results for reference
      const proj = _getProject();
      proj.searchResults = {
        bestPractices: bestPractices.source,
        topicResearch: topicResearch?.source || 'llm_knowledge'
      };
      store.saveProject(proj);
      _complete();

      // HITL Checkpoint 1 (or auto-approve)
      if (_isAutoApprove()) {
        await approveResearch(null);
      } else {
        _transition(STAGES.HITL_RESEARCH_REVIEW);
      }
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
      const scratchpad = project.scratchpad || [];

      _transition(STAGES.DESIGNING_PERSONA);
      const personaOutput = await agents.runPersonaDesigner(
        researchOutput,
        project.intake,
        project.hitlNotes.researchReview || null,
        scratchpad,
        currentProjectId
      );
      store.updateAgentOutput(currentProjectId, 'personaDesigner', personaOutput);
      _complete();

      // HITL Checkpoint 2 (or auto-approve)
      if (_isAutoApprove()) {
        await approvePersona(null);
      } else {
        _transition(STAGES.HITL_PERSONA_REVIEW);
      }
    } catch (e) {
      _handleError(e);
    }
  }

  // --- HITL 2: User approves persona ---
  async function approvePersona(editedSystemPrompt) {
    if (editedSystemPrompt) {
      const project = _getProject();
      project.userEdits.systemPrompt = editedSystemPrompt;
      project.agentOutputs.personaDesigner.systemPrompt = editedSystemPrompt;
      store.saveProject(project);
    }
    _complete();
    await runCurationPhase();
  }

  async function requestPersonaChanges(feedback) {
    const project = _getProject();
    project.hitlNotes.personaReview = feedback;
    store.saveProject(project);
    _complete();
    await runDesignPhase();
  }

  // --- Phase 3: Knowledge Curation ---
  async function runCurationPhase() {
    try {
      const project = _getProject();
      const scratchpad = project.scratchpad || [];
      const knowledgeDepth = project.approvedKnowledgeDepth || 'standard';

      _transition(STAGES.CURATING_KNOWLEDGE);
      const knowledgeOutput = await agents.runKnowledgeCurator(
        project.agentOutputs.researcher,
        project.agentOutputs.personaDesigner,
        project.intake,
        scratchpad,
        knowledgeDepth,
        currentProjectId
      );
      store.updateAgentOutput(currentProjectId, 'knowledgeCurator', knowledgeOutput);
      _complete();

      // HITL Checkpoint 3 (or auto-approve)
      if (_isAutoApprove()) {
        await approveConfig();
      } else {
        _transition(STAGES.HITL_CONFIG_REVIEW);
      }
    } catch (e) {
      _handleError(e);
    }
  }

  // --- HITL 3: User approves knowledge docs ---
  async function approveConfig() {
    _complete();
    await runValidationPhase();
  }

  async function requestKnowledgeChanges(feedback) {
    const project = _getProject();
    project.hitlNotes.configReview = feedback;
    store.saveProject(project);
    _complete();
    await runCurationPhase();
  }

  // --- Phase 4: Validation ---
  async function runValidationPhase() {
    try {
      const project = _getProject();

      _transition(STAGES.VALIDATING);
      const validatorOutput = await agents.runValidator(
        project.agentOutputs.personaDesigner,
        project.agentOutputs.knowledgeCurator,
        project.intake,
        project.guardrailCategories || ['topic_boundaries'],
        project.scratchpad || [],
        currentProjectId
      );
      store.updateAgentOutput(currentProjectId, 'validator', validatorOutput);
      _complete();

      // HITL Checkpoint 4 (or auto to complete)
      if (_isAutoApprove()) {
        _transition(STAGES.COMPLETE);
      } else {
        _transition(STAGES.HITL_RESULTS_REVIEW);
      }
    } catch (e) {
      _handleError(e);
    }
  }

  // --- HITL 4: User approves QA results ---
  async function approveResults() {
    _complete();
    _transition(STAGES.COMPLETE);
  }

  // --- Revision Loop ---
  async function revise(feedback, targetAgent) {
    const project = _getProject();
    project.revisions.push({
      timestamp: new Date().toISOString(),
      feedback,
      targetAgent: targetAgent || 'personaDesigner'
    });
    project.hitlNotes.revision = feedback;
    store.saveProject(project);
    _transition(STAGES.REVISING);

    if (targetAgent === 'researcher') {
      await runSearchPhase();
    } else if (targetAgent === 'knowledgeCurator') {
      project.hitlNotes.configReview = feedback;
      store.saveProject(project);
      await runCurationPhase();
    } else {
      // Default: re-run from persona designer
      project.hitlNotes.personaReview = feedback;
      store.saveProject(project);
      await runDesignPhase();
    }
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
    beginAfterIntake,
    approveResearch,
    rerunResearch,
    approvePersona,
    requestPersonaChanges,
    approveConfig,
    requestKnowledgeChanges,
    approveResults,
    revise,
    setStageChangeHandler,
    getCurrentProjectId,
    setCurrentProjectId
  };
})();
