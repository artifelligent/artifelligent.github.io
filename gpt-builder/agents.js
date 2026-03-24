// agents.js — Agent definitions: system prompts, I/O schemas, LLM call logic

const agents = (() => {

  // --- Agent 1: Topic Researcher ---
  const RESEARCHER_PROMPT = `You are a research specialist for building custom GPTs. You have two tasks:

TASK 1 - GPT BEST PRACTICES:
Analyze the provided search results about best practices for building custom GPTs. Summarize the top 10-15 actionable practices, organized by category:
- System prompt structure and writing
- Knowledge file formatting
- Conversation starter design
- Guardrails and safety patterns
- Recent changes or recommendations

TASK 2 - TOPIC RESEARCH:
For the user's specified topic, research and produce:
- Core concepts and terminology (glossary of key terms)
- Common user questions and intents (what will users ask this GPT?)
- Domain boundaries (what is in-scope vs. out-of-scope for this GPT)
- Key facts, relationships, and nuances an expert would know
- Common misconceptions to address

You MUST respond with valid JSON only, no markdown fences, no explanation outside the JSON. Use this exact structure:
{
  "gptBestPractices": [{"category": "string", "practice": "string", "details": "string"}],
  "topicGlossary": [{"term": "string", "definition": "string"}],
  "userIntents": [{"intent": "string", "example": "string", "priority": "high|medium|low"}],
  "domainBoundaries": {"inScope": ["string"], "outOfScope": ["string"]},
  "keyFacts": [{"fact": "string", "context": "string"}],
  "misconceptions": [{"myth": "string", "reality": "string"}]
}`;

  async function runResearcher(topic, description, bestPracticesData, topicResearchData) {
    const userMsg = `TOPIC: ${topic}
DESCRIPTION: ${description}

--- GPT BEST PRACTICES SEARCH RESULTS ---
${bestPracticesData || 'No search results available. Use your training knowledge about GPT best practices.'}

--- TOPIC RESEARCH RESULTS ---
${topicResearchData || 'No search results available. Use your training knowledge about this topic.'}

Analyze these results and produce the structured JSON output as specified.`;

    const raw = await api.callLLM(RESEARCHER_PROMPT, userMsg, { jsonOutput: true });
    return parseJSON(raw);
  }

  // --- Agent 2: Persona/System Prompt Designer ---
  const PERSONA_PROMPT = `You are an expert GPT configuration designer. Using the research provided, create a complete GPT configuration.

You MUST create:
1. NAME: A clear, memorable, professional name for the GPT
2. DESCRIPTION: 1-2 sentence description for the GPT store listing
3. SYSTEM PROMPT: Full system instructions (800-2000 words) including:
   - Role definition and expertise boundaries
   - Tone and personality directives
   - Response format preferences
   - Guardrails (what to refuse, how to handle edge cases, off-topic questions)
   - Citation/sourcing behavior
   - Multi-turn conversation handling
   Apply the best practices from the research.
4. CONVERSATION STARTERS: 4 specific, actionable example prompts users can click
5. BEHAVIORAL GUARDRAILS: Explicit list of do/don't rules

You MUST respond with valid JSON only, no markdown fences:
{
  "name": "string",
  "description": "string",
  "systemPrompt": "string (the full system instructions, can be multi-paragraph)",
  "conversationStarters": ["string", "string", "string", "string"],
  "guardrails": {"do": ["string"], "dont": ["string"]}
}`;

  async function runPersonaDesigner(researchOutput, topic, description, hitlNotes) {
    const userMsg = `TOPIC: ${topic}
DESCRIPTION: ${description}

--- RESEARCH DATA ---
${JSON.stringify(researchOutput, null, 2)}

${hitlNotes ? `--- USER NOTES/CORRECTIONS ---\n${hitlNotes}\nPlease incorporate these notes into your design.` : ''}

Design the complete GPT configuration based on this research.`;

    const raw = await api.callLLM(PERSONA_PROMPT, userMsg, { jsonOutput: true });
    return parseJSON(raw);
  }

  // --- Agent 3: Knowledge Curator ---
  const CURATOR_PROMPT = `You are a knowledge base architect for custom GPTs. Using the research and persona configuration provided, create structured knowledge documents formatted for GPT knowledge upload.

Create these documents:
1. FAQ DOCUMENT: 20+ Q&A pairs covering the most common user questions. Format each as "Q: ... A: ..."
2. REFERENCE GUIDE: Organized domain knowledge — terminology, concepts, relationships, organized with clear headings
3. EDGE CASES DOCUMENT: Tricky scenarios, common mistakes, nuanced answers, boundary conditions
4. QUICK REFERENCE CARD: Cheat-sheet style summary the GPT can reference for fast answers

Each document should be formatted as clean Markdown suitable for GPT knowledge file upload.

You MUST respond with valid JSON only, no markdown fences:
{
  "faqDocument": "string (full Markdown content)",
  "referenceGuide": "string (full Markdown content)",
  "edgeCases": "string (full Markdown content)",
  "quickReference": "string (full Markdown content)"
}`;

  async function runKnowledgeCurator(researchOutput, personaOutput, topic) {
    const userMsg = `TOPIC: ${topic}

--- RESEARCH DATA ---
${JSON.stringify(researchOutput, null, 2)}

--- GPT PERSONA/CONFIG ---
Name: ${personaOutput.name}
Description: ${personaOutput.description}
Guardrails: ${JSON.stringify(personaOutput.guardrails)}
Key intents to cover: ${researchOutput.userIntents?.map(i => i.intent).join(', ') || 'See research data'}

Create comprehensive knowledge documents for this GPT.`;

    const raw = await api.callLLM(CURATOR_PROMPT, userMsg, { jsonOutput: true });
    return parseJSON(raw);
  }

  // --- Agent 4: Validator/QA ---
  const VALIDATOR_PROMPT = `You are a QA specialist for custom GPTs. Given the complete GPT configuration (system prompt, knowledge docs, guardrails), perform thorough validation.

You MUST:
1. Generate 10 diverse test queries a real user would ask:
   - 3 easy/common questions
   - 3 medium complexity questions
   - 2 hard/nuanced questions
   - 1 edge case (boundary of scope)
   - 1 out-of-scope question (should be redirected/declined)
2. For each query, simulate what the GPT would likely answer given its system prompt and knowledge
3. Rate each simulated response (1-5) on: accuracy, helpfulness, toneConsistency, guardrailCompliance
4. Identify gaps in knowledge or system prompt coverage
5. Provide specific, actionable recommendations for improvement

You MUST respond with valid JSON only, no markdown fences:
{
  "testResults": [
    {
      "query": "string",
      "category": "easy|medium|hard|edge_case|out_of_scope",
      "simulatedResponse": "string",
      "scores": {"accuracy": 1-5, "helpfulness": 1-5, "toneConsistency": 1-5, "guardrailCompliance": 1-5},
      "issues": ["string"] or []
    }
  ],
  "gaps": ["string"],
  "recommendations": ["string"],
  "overallScore": 1-5
}`;

  async function runValidator(personaOutput, knowledgeOutput, topic) {
    const systemPromptToTest = personaOutput.systemPrompt;
    const userMsg = `TOPIC: ${topic}

--- SYSTEM PROMPT BEING TESTED ---
${systemPromptToTest}

--- CONVERSATION STARTERS ---
${personaOutput.conversationStarters?.join('\n') || 'None'}

--- GUARDRAILS ---
Do: ${personaOutput.guardrails?.do?.join('; ') || 'None specified'}
Don't: ${personaOutput.guardrails?.dont?.join('; ') || 'None specified'}

--- KNOWLEDGE DOCUMENTS SUMMARY ---
FAQ: ${(knowledgeOutput.faqDocument || '').substring(0, 1500)}...
Reference Guide: ${(knowledgeOutput.referenceGuide || '').substring(0, 1500)}...
Edge Cases: ${(knowledgeOutput.edgeCases || '').substring(0, 1000)}...

Validate this GPT configuration thoroughly.`;

    const raw = await api.callLLM(VALIDATOR_PROMPT, userMsg, { jsonOutput: true });
    return parseJSON(raw);
  }

  // --- Utility ---
  function parseJSON(raw) {
    if (!raw) throw new Error('Empty response from LLM');
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse agent JSON output:', cleaned.substring(0, 500));
      throw new Error('Agent returned invalid JSON. Please try again.');
    }
  }

  return {
    runResearcher,
    runPersonaDesigner,
    runKnowledgeCurator,
    runValidator
  };
})();
