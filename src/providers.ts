export interface ProviderInfo {
  id: string;           // OpenCode provider ID
  name: string;         // Display name
  authType: 'api_key' | 'oauth' | 'env_vars' | 'custom';
  envVars?: Array<{     // Extra env vars needed (beyond api_key)
    key: string;
    label: string;
    required: boolean;
    placeholder?: string;
  }>;
  baseUrl?: string;     // Default base URL if applicable
  description?: string; // Short description
}

export const PROVIDER_REGISTRY: ProviderInfo[] = [
  { id: '302-ai', name: '302.AI', authType: 'api_key' },

  { id: 'amazon-bedrock', name: 'Amazon Bedrock', authType: 'env_vars',
    envVars: [
      { key: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key ID', required: true, placeholder: 'AKIA...' },
      { key: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key', required: true },
      { key: 'AWS_REGION', label: 'AWS Region', required: false, placeholder: 'us-east-1' },
      { key: 'AWS_PROFILE', label: 'AWS Profile', required: false },
    ],
    description: 'Amazon Bedrock with AWS credentials'
  },

  { id: 'anthropic', name: 'Anthropic', authType: 'api_key',
    baseUrl: 'https://api.anthropic.com/v1',
    description: 'Claude models via Anthropic API'
  },

  { id: 'azure', name: 'Azure OpenAI', authType: 'api_key',
    envVars: [
      { key: 'AZURE_RESOURCE_NAME', label: 'Azure Resource Name', required: true, placeholder: 'my-resource' },
    ],
    description: 'OpenAI models via Azure'
  },

  { id: 'azure-cognitive-services', name: 'Azure Cognitive Services', authType: 'api_key',
    envVars: [
      { key: 'AZURE_COGNITIVE_SERVICES_RESOURCE_NAME', label: 'Resource Name', required: true },
    ],
  },

  { id: 'baseten', name: 'Baseten', authType: 'api_key' },

  { id: 'cerebras', name: 'Cerebras', authType: 'api_key',
    description: 'Fast inference for Qwen, Llama models'
  },

  { id: 'cloudflare-ai-gateway', name: 'Cloudflare AI Gateway', authType: 'api_key',
    envVars: [
      { key: 'CLOUDFLARE_ACCOUNT_ID', label: 'Cloudflare Account ID', required: true },
      { key: 'CLOUDFLARE_GATEWAY_ID', label: 'Cloudflare Gateway ID', required: true },
    ],
    description: 'Multi-provider routing via Cloudflare'
  },

  { id: 'cloudflare-workers-ai', name: 'Cloudflare Workers AI', authType: 'api_key',
    envVars: [
      { key: 'CLOUDFLARE_ACCOUNT_ID', label: 'Cloudflare Account ID', required: true },
    ],
  },

  { id: 'cortecs', name: 'Cortecs', authType: 'api_key' },

  { id: 'cohere', name: 'Cohere', authType: 'api_key',
    description: 'Command R+ and embedding models'
  },

  { id: 'deepseek', name: 'DeepSeek', authType: 'api_key',
    description: 'DeepSeek Reasoner and variants'
  },

  { id: 'deep-infra', name: 'Deep Infra', authType: 'api_key',
    description: 'Open-source model hosting'
  },

  { id: 'firmware', name: 'Firmware', authType: 'api_key' },

  { id: 'fireworks-ai', name: 'Fireworks AI', authType: 'api_key',
    description: 'Fast inference for open models'
  },

  { id: 'google-generative-ai', name: 'Google Gemini', authType: 'api_key',
    description: 'Gemini models via Google AI Studio API key'
  },

  { id: 'gitlab', name: 'GitLab Duo', authType: 'api_key',
    envVars: [
      { key: 'GITLAB_INSTANCE_URL', label: 'GitLab Instance URL', required: false, placeholder: 'https://gitlab.com' },
      { key: 'GITLAB_AI_GATEWAY_URL', label: 'AI Gateway URL', required: false },
    ],
    description: 'GitLab Duo AI models'
  },

  { id: 'github-copilot', name: 'GitHub Copilot', authType: 'oauth',
    description: 'Models via GitHub Copilot subscription'
  },

  { id: 'google-vertex-ai', name: 'Google Vertex AI', authType: 'env_vars',
    envVars: [
      { key: 'GOOGLE_APPLICATION_CREDENTIALS', label: 'Service Account JSON Path', required: false },
      { key: 'GOOGLE_CLOUD_PROJECT', label: 'GCP Project ID', required: true },
      { key: 'VERTEX_LOCATION', label: 'Vertex Location', required: false, placeholder: 'us-central1' },
    ],
    description: 'Google models via Vertex AI'
  },

  { id: 'groq', name: 'Groq', authType: 'api_key',
    description: 'Ultra-fast inference'
  },

  { id: 'hugging-face', name: 'Hugging Face', authType: 'api_key',
    description: 'Inference API for open models'
  },

  { id: 'helicone', name: 'Helicone', authType: 'api_key',
    baseUrl: 'https://ai-gateway.helicone.ai',
    description: 'Observability gateway with caching'
  },

  { id: 'io-net', name: 'IO.NET', authType: 'api_key' },

  { id: 'llama-cpp', name: 'llama.cpp (Local)', authType: 'custom',
    baseUrl: 'http://127.0.0.1:8080/v1',
    description: 'Local models via llama.cpp server'
  },

  { id: 'lmstudio', name: 'LM Studio (Local)', authType: 'custom',
    baseUrl: 'http://127.0.0.1:1234/v1',
    description: 'Local models via LM Studio'
  },

  { id: 'minimax', name: 'MiniMax', authType: 'api_key' },

  { id: 'mistral', name: 'Mistral AI', authType: 'api_key',
    description: 'Mistral, Mixtral, and Codestral models'
  },

  { id: 'moonshot-ai', name: 'Moonshot AI', authType: 'api_key',
    description: 'Kimi K2 models'
  },

  { id: 'nebius-token-factory', name: 'Nebius', authType: 'api_key' },

  { id: 'ollama', name: 'Ollama (Local)', authType: 'custom',
    baseUrl: 'http://localhost:11434/v1',
    description: 'Local models via Ollama'
  },

  { id: 'ollama-cloud', name: 'Ollama Cloud', authType: 'api_key' },

  { id: 'openai', name: 'OpenAI', authType: 'api_key',
    description: 'GPT-4o, o1, and other OpenAI models'
  },

  { id: 'opencode-zen', name: 'OpenCode Zen', authType: 'api_key',
    description: 'Curated verified models'
  },

  { id: 'opencode-go', name: 'OpenCode Go', authType: 'api_key',
    description: 'Low-cost open coding models'
  },

  { id: 'openrouter', name: 'OpenRouter', authType: 'api_key',
    description: '100+ models with provider routing'
  },

  { id: 'perplexity', name: 'Perplexity', authType: 'api_key',
    description: 'Sonar models with web search'
  },

  { id: 'ovhcloud-ai-endpoints', name: 'OVHcloud AI Endpoints', authType: 'api_key' },

  { id: 'sap-ai-core', name: 'SAP AI Core', authType: 'env_vars',
    envVars: [
      { key: 'AICORE_SERVICE_KEY', label: 'Service Key JSON', required: true },
      { key: 'AICORE_DEPLOYMENT_ID', label: 'Deployment ID', required: false },
      { key: 'AICORE_RESOURCE_GROUP', label: 'Resource Group', required: false, placeholder: 'default' },
    ],
    description: '40+ models from multiple providers'
  },

  { id: 'scaleway', name: 'Scaleway', authType: 'api_key' },

  { id: 'stackit', name: 'STACKIT', authType: 'api_key',
    description: 'Qwen, Llama models'
  },

  { id: 'together-ai', name: 'Together AI', authType: 'api_key',
    description: 'Open model hosting and inference'
  },

  { id: 'venice-ai', name: 'Venice AI', authType: 'api_key' },

  { id: 'vercel', name: 'Vercel AI Gateway', authType: 'api_key',
    description: 'Unified multi-provider gateway'
  },

  { id: 'xai', name: 'xAI', authType: 'api_key',
    description: 'Grok models'
  },

  { id: 'z-ai', name: 'Z.AI', authType: 'api_key',
    description: 'GLM-4.7 and coding models'
  },

  { id: 'zenmux', name: 'ZenMux', authType: 'api_key' },

  { id: 'custom', name: 'Custom (OpenAI-compatible)', authType: 'api_key',
    description: 'Any OpenAI-compatible API endpoint'
  },
];

export function getProviderInfo(id: string): ProviderInfo | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === id);
}
