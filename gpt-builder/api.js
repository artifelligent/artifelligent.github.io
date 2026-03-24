// api.js — LLM API client with multi-provider support

const api = (() => {
  const PROVIDERS = {
    openai: {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/responses',
      defaultModel: 'gpt-4o',
      headers(key) {
        return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        };
      },
      formatRequest(systemPrompt, userMessage, options = {}) {
        const input = [];
        if (systemPrompt) {
          input.push({ role: 'developer', content: systemPrompt });
        }
        if (typeof userMessage === 'string') {
          input.push({ role: 'user', content: userMessage });
        } else if (Array.isArray(userMessage)) {
          input.push(...userMessage);
        }
        const body = {
          model: options.model || 'gpt-4o',
          input,
        };
        if (options.jsonOutput) {
          body.text = { format: { type: 'json_object' } };
        }
        if (options.tools) {
          body.tools = options.tools;
        }
        return body;
      },
      parseResponse(data) {
        // Responses API: output is an array of output items
        if (data.output && Array.isArray(data.output)) {
          const texts = [];
          for (const item of data.output) {
            if (item.type === 'message' && item.content) {
              for (const block of item.content) {
                if (block.type === 'output_text') {
                  texts.push(block.text);
                }
              }
            }
          }
          return texts.join('\n');
        }
        return '';
      }
    }
  };

  async function callLLM(systemPrompt, userMessage, options = {}) {
    const providerKey = store.getProvider();
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error(`Unknown provider: ${providerKey}`);

    const apiKey = store.getApiKey();
    if (!apiKey) throw new Error('API key not set. Please configure your API key in settings.');

    const body = provider.formatRequest(systemPrompt, userMessage, options);
    const headers = provider.headers(apiKey);

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let msg = `API error ${response.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        msg = parsed.error?.message || parsed.message || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();
    return provider.parseResponse(data);
  }

  async function testConnection() {
    try {
      const result = await callLLM(
        'You are a helpful assistant.',
        'Reply with exactly: CONNECTION_OK',
        { model: PROVIDERS[store.getProvider()].defaultModel }
      );
      return result.includes('CONNECTION_OK');
    } catch (e) {
      throw e;
    }
  }

  function getProviderInfo() {
    const key = store.getProvider();
    return PROVIDERS[key] || PROVIDERS.openai;
  }

  return { callLLM, testConnection, getProviderInfo, PROVIDERS };
})();
