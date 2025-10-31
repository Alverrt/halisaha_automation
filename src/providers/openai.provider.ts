import OpenAI from 'openai';
import { LLMProvider, Message, ToolDefinition, CompletionResponse, ToolCall } from './types';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async createCompletion(
    messages: Message[],
    tools: ToolDefinition[],
    maxTokens: number
  ): Promise<CompletionResponse> {
    // Convert our generic format to OpenAI format
    const openaiMessages: ChatCompletionMessageParam[] = messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.tool_call_id!,
          content: msg.content,
        };
      }

      if (msg.tool_calls) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }

      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });

    const openaiTools: ChatCompletionTool[] = tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools,
      tool_choice: 'auto',
      max_completion_tokens: maxTokens,
    });

    const assistantMessage = response.choices[0].message;

    // Convert OpenAI format back to our generic format
    const genericMessage: Message = {
      role: 'assistant',
      content: assistantMessage.content || '',
    };

    if (assistantMessage.tool_calls) {
      genericMessage.tool_calls = assistantMessage.tool_calls
        .filter(tc => tc.type === 'function')
        .map(tc => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
    }

    return {
      message: genericMessage,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      } : undefined,
    };
  }
}
