// api.js — LLM API client with cost tracking, streaming, and retry logic

const api = (() => {
  const PROVIDERS = {
    openai: {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/responses',
      models: {
        research: 'gpt-4o-mini',
        creative: 'gpt-4o',
        qa: 'gpt-4o'
      },
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
          temperature: options.temperature ?? 0.4,
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
        const result = { text: '', tokensIn: 0, tokensOut: 0 };
        if (data.usage) {
          result.tokensIn = data.usage.input_tokens || 0;
          result.tokensOut = data.usage.output_tokens || 0;
        }
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
          result.text = texts.join('\n');
        }
        return result;
      }
    }
  };

  // --- Activity Log ---
  let _activityLog = [];
  let _onActivity = null;

  function setActivityHandler(handler) { _onActivity = handler; }

  function _log(agent, message, type = 'info') {
    const entry = { agent, message, type, timestamp: new Date().toISOString() };
    _activityLog.push(entry);
    if (_onActivity) _onActivity(entry);
  }

  function getActivityLog() { return _activityLog; }
  function clearActivityLog() { _activityLog = []; }

  // --- Retry Logic ---
  const MAX_RETRIES = 5;
  const BACKOFF_BASE_MS = 1000;

  async function _fetchWithRetry(url, options, agentName) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        _log(agentName, `Retry ${attempt}/${MAX_RETRIES} in ${delayMs / 1000}s...`, 'warn');
        await new Promise(r => setTimeout(r, delayMs));
      }
      try {
        const response = await fetch(url, options);
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : BACKOFF_BASE_MS * Math.pow(2, attempt);
          _log(agentName, `Rate limited. Waiting ${waitMs / 1000}s...`, 'warn');
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          _log(agentName, `Server error ${response.status}. Will retry...`, 'warn');
          lastError = new Error(`Server error ${response.status}`);
          continue;
        }
        return response;
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES) {
          _log(agentName, `Network error: ${e.message}. Will retry...`, 'warn');
        }
      }
    }
    throw lastError || new Error('Request failed after retries');
  }

  // --- Core API Call ---
  async function callLLM(systemPrompt, userMessage, options = {}) {
    const providerKey = store.getProvider();
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error(`Unknown provider: ${providerKey}`);

    const apiKey = store.getApiKey();
    if (!apiKey) throw new Error('API key not set. Please configure your API key in settings.');

    const agentName = options.agentName || 'System';
    const model = options.model || provider.models.creative;

    _log(agentName, `Calling ${model}...`, 'info');

    const body = provider.formatRequest(systemPrompt, userMessage, { ...options, model });
    const headers = provider.headers(apiKey);

    const response = await _fetchWithRetry(provider.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }, agentName);

    if (!response.ok) {
      const errorBody = await response.text();
      let msg = `API error ${response.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        msg = parsed.error?.message || parsed.message || msg;
      } catch (_) {}
      _log(agentName, `Error: ${msg}`, 'error');
      throw new Error(msg);
    }

    const data = await response.json();
    const result = provider.parseResponse(data);

    _log(agentName, `Done. ${result.tokensIn + result.tokensOut} tokens used.`, 'success');

    // Track cost if we have a project
    if (options.projectId) {
      store.logApiCall(options.projectId, agentName, result.tokensIn, result.tokensOut, model);
    }

    return result.text;
  }

  // --- Test Connection ---
  async function testConnection() {
    try {
      const result = await callLLM(
        'You are a helpful assistant.',
        'Reply with exactly: CONNECTION_OK',
        { model: PROVIDERS[store.getProvider()].models.research, agentName: 'System' }
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

  function getModelForRole(role) {
    const provider = PROVIDERS[store.getProvider()];
    return provider.models[role] || provider.models.creative;
  }

  return {
    callLLM, testConnection, getProviderInfo, getModelForRole, PROVIDERS,
    setActivityHandler, getActivityLog, clearActivityLog
  };
})();
