// search.js — Web search integration for GPT best practices (provider-native)

const search = (() => {

  // Curated fallback best practices (used when web search is unavailable)
  const CACHED_BEST_PRACTICES = {
    source: 'cached',
    timestamp: '2026-03-01',
    data: `## GPT Building Best Practices (Curated Reference)

### System Prompt Structure
1. Start with a clear role definition: "You are [role] that helps [audience] with [task]"
2. Define expertise boundaries explicitly — what the GPT should and should not discuss
3. Specify response format preferences (bullet points, paragraphs, step-by-step, etc.)
4. Include tone/personality directives (professional, friendly, concise, etc.)
5. Add guardrails: explicit instructions for handling off-topic questions, harmful requests, and edge cases

### Knowledge Files
6. Use structured Markdown for knowledge files — headings, lists, and tables are parsed well
7. Keep individual knowledge files under 20MB; prefer multiple focused files over one large dump
8. Include a FAQ document for the most common user queries
9. Add a glossary/terminology reference for domain-specific terms

### Conversation Starters
10. Provide 4 conversation starters that demonstrate the GPT's range of capabilities
11. Make starters specific and actionable, not generic

### Guardrails & Safety
12. Explicitly instruct the GPT to stay in its lane — redirect off-topic queries politely
13. Include instructions for handling requests for medical/legal/financial advice (add appropriate disclaimers)
14. Tell the GPT how to handle "I don't know" scenarios — admit uncertainty rather than fabricate

### Advanced Patterns
15. Use structured output instructions for consistent response formatting
16. Include example interactions in the system prompt for complex behaviors
17. Consider multi-turn conversation flow — how should the GPT handle follow-ups?`
  };

  /**
   * Fetch GPT best practices using OpenAI's web search tool.
   * Falls back to cached practices if search is unavailable.
   */
  async function fetchGPTBestPractices(projectId) {
    try {
      const result = await api.callLLM(
        `You are a research assistant. Search the web for the latest best practices for building custom GPTs (OpenAI custom GPTs). Focus on:
- System prompt structure and writing tips
- Knowledge file formatting and best practices
- Conversation starter design
- Guardrails and safety patterns
- Any recent OpenAI policy or capability changes for custom GPTs

Summarize your findings as a comprehensive, actionable guide. Include specific tips and examples where possible. Format as Markdown.`,
        'Find the latest best practices for building custom GPTs in 2026. Search for recent guides, tips, and recommendations.',
        {
          tools: [{ type: 'web_search_preview' }],
          agentName: 'Scout',
          projectId,
          model: api.getModelForRole('research')
        }
      );

      if (result && result.length > 100) {
        return { source: 'web_search', timestamp: new Date().toISOString(), data: result };
      }
    } catch (e) {
      console.warn('Web search failed, falling back to cached practices:', e.message);
    }

    return { ...CACHED_BEST_PRACTICES };
  }

  /**
   * Research a specific topic using web search.
   */
  async function researchTopic(topic, description, projectId) {
    try {
      const result = await api.callLLM(
        `You are a research assistant. Search the web to gather comprehensive information about the following topic. Your goal is to collect enough domain knowledge to build an expert AI assistant on this topic.

Focus on:
- Core concepts and terminology
- Common questions people have about this topic
- Key facts, statistics, and relationships
- Common misconceptions
- Recent developments or changes in this field
- Authoritative sources and references

Format your findings as structured Markdown with clear sections.`,
        `Research this topic thoroughly: "${topic}"\n\nAdditional context: ${description}\n\nSearch for comprehensive, up-to-date information about this topic.`,
        {
          tools: [{ type: 'web_search_preview' }],
          agentName: 'Scout',
          projectId,
          model: api.getModelForRole('research')
        }
      );

      if (result && result.length > 100) {
        return { source: 'web_search', timestamp: new Date().toISOString(), data: result };
      }
    } catch (e) {
      console.warn('Topic research web search failed:', e.message);
    }

    return null;
  }

  return { fetchGPTBestPractices, researchTopic, CACHED_BEST_PRACTICES };
})();
