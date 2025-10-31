import { LLMProvider, Message, ToolDefinition } from './providers/types';

/**
 * Lightweight tool description for the routing stage
 */
export interface ToolSummary {
  name: string;
  description: string;
}

/**
 * Smart tool router that uses two-stage tool calling:
 * Stage 1: Send lightweight tool names/descriptions → LLM picks top N relevant tools
 * Stage 2: Send full schemas for only selected tools → LLM executes
 */
export class ToolRouter {
  private llmProvider: LLMProvider;
  private allTools: ToolDefinition[];
  private toolSummaries: ToolSummary[];

  constructor(llmProvider: LLMProvider, tools: ToolDefinition[]) {
    this.llmProvider = llmProvider;
    this.allTools = tools;

    // Create lightweight summaries
    this.toolSummaries = tools.map(tool => ({
      name: tool.name,
      description: tool.description
    }));
  }

  /**
   * Stage 1: Get relevant tools using lightweight descriptions
   */
  async selectRelevantTools(userMessage: string, topN: number = 3): Promise<ToolDefinition[]> {
    // Create a prompt asking LLM to select most relevant tools
    const routingPrompt: Message[] = [
      {
        role: 'system',
        content: `Sen bir tool seçim asistanısın. Kullanıcının mesajına göre en alakalı ${topN} aracı seç.

MEVCUT ARAÇLAR:
${this.toolSummaries.map((t, i) => `${i + 1}. ${t.name}: ${t.description}`).join('\n')}

GÖREV: Kullanıcının mesajını analiz et ve yukarıdaki listeden en alakalı ${topN} aracı seç.
Yanıtını SADECE araç isimlerini virgülle ayırarak ver (başka hiçbir şey yazma):

Örnek: create_reservation,show_week_table,get_current_time`
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    try {
      // Call LLM without tools (lightweight routing call)
      const response = await this.llmProvider.createCompletion(
        routingPrompt,
        [], // No tools in routing stage
        200 // Low token limit for routing
      );

      const selectedToolNames = (response.message.content || '')
        .trim()
        .split(',')
        .map(name => name.trim())
        .filter(name => name.length > 0)
        .slice(0, topN); // Ensure we only take topN

      if (process.env.NODE_ENV === 'development') {
        console.log('\n=== Tool Routing ===');
        console.log('User message:', userMessage);
        console.log('Selected tools:', selectedToolNames);
      }

      // Map selected names to full tool definitions
      const selectedTools = selectedToolNames
        .map(name => this.allTools.find(t => t.name === name))
        .filter((tool): tool is ToolDefinition => tool !== undefined);

      // If no tools selected or invalid response, return all tools as fallback
      if (selectedTools.length === 0) {
        console.warn('Tool routing failed, falling back to all tools');
        return this.allTools;
      }

      return selectedTools;
    } catch (error) {
      console.error('Error in tool routing:', error);
      // Fallback to all tools on error
      return this.allTools;
    }
  }

  /**
   * Get all tools (for cases where routing is not needed)
   */
  getAllTools(): ToolDefinition[] {
    return this.allTools;
  }

  /**
   * Update tools if needed
   */
  updateTools(tools: ToolDefinition[]): void {
    this.allTools = tools;
    this.toolSummaries = tools.map(tool => ({
      name: tool.name,
      description: tool.description
    }));
  }
}
