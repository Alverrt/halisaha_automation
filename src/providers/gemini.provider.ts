import { GoogleGenAI, FunctionCallingConfigMode, FunctionDeclaration, Type } from '@google/genai';
import { LLMProvider, Message, ToolDefinition, CompletionResponse, ToolCall } from './types';

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(project: string, location: string = 'us-central1', model: string = 'gemini-2.0-flash') {
    this.client = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
    this.model = model;
  }

  async createCompletion(
    messages: Message[],
    tools: ToolDefinition[],
    maxTokens: number
  ): Promise<CompletionResponse> {
    // Convert tools to function declarations
    const functionDeclarations: FunctionDeclaration[] = tools.map(tool => {
      // parametersJsonSchema should use lowercase string types, not Type enum
      const params: any = {
        type: 'object',
        properties: tool.parameters.properties || {},
        required: tool.parameters.required || [],
      };

      const declaration = {
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: params,
      };

      // Debug log for development
      if (process.env.NODE_ENV === 'development' && tool.name === 'get_current_time') {
        console.log('get_current_time schema:', JSON.stringify(declaration, null, 2));
      }

      return declaration;
    });

    // Convert messages to Gemini Content format
    let systemInstruction = '';
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
        continue;
      }

      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.tool_calls) {
          for (const toolCall of msg.tool_calls) {
            parts.push({
              functionCall: {
                name: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments),
              },
            });
          }
        }

        if (parts.length > 0) {
          contents.push({
            role: 'model',
            parts,
          });
        }
      } else if (msg.role === 'tool') {
        // Add function response
        contents.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: msg.tool_call_id || 'unknown',
              response: {
                result: msg.content,
              },
            },
          }],
        });
      }
    }

    // Generate content with new API
    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: systemInstruction || undefined,
        maxOutputTokens: maxTokens,
        tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
        toolConfig: functionDeclarations.length > 0 ? {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        } : undefined,
      },
    });

    // Extract function calls and text content from parts
    const functionCalls: ToolCall[] = [];
    let textContent = '';

    // Log full response for debugging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('\n=== Gemini Full Response ===');
      console.log('Candidates:', response.candidates?.length || 0);
      if (response.candidates?.[0]) {
        console.log('Finish reason:', response.candidates[0].finishReason);
        console.log('Safety ratings:', JSON.stringify(response.candidates[0].safetyRatings, null, 2));
        console.log('Content:', JSON.stringify(response.candidates[0].content, null, 2));
      }
    }

    // Check for errors in response
    const finishReason = response.candidates?.[0]?.finishReason;

    // Handle MALFORMED_FUNCTION_CALL
    if (finishReason === 'MALFORMED_FUNCTION_CALL') {
      console.error('Gemini returned MALFORMED_FUNCTION_CALL');
      console.error('Full candidate:', JSON.stringify(response.candidates?.[0], null, 2));

      // Return an error message that the LLM can recover from
      const genericMessage: Message = {
        role: 'assistant',
        content: 'Özür dilerim, bir işlem yapmaya çalışırken hata oluştu. Lütfen isteğinizi tekrar belirtir misiniz?',
      };

      return {
        message: genericMessage,
        usage: response.usageMetadata ? {
          prompt_tokens: response.usageMetadata.promptTokenCount || 0,
          completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata.totalTokenCount || 0,
        } : undefined,
      };
    }

    // Extract text from parts manually to avoid warnings
    if (response.candidates?.[0]?.content?.parts) {
      const parts = response.candidates[0].content.parts;

      // Extract text parts
      const textParts = parts
        .filter((part: any) => part.text)
        .map((part: any) => part.text);
      textContent = textParts.join('');

      // Log for debugging in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Gemini response parts:', JSON.stringify(parts, null, 2));
        console.log('Extracted text:', textContent);
      }
    } else {
      // No parts in response
      if (process.env.NODE_ENV === 'development') {
        console.log('WARNING: No parts in Gemini response!');
        console.log('Response object keys:', Object.keys(response));
      }
    }

    if (response.functionCalls) {
      for (const call of response.functionCalls) {
        functionCalls.push({
          id: call.id || call.name || 'unknown',
          type: 'function',
          function: {
            name: call.name || '',
            arguments: JSON.stringify(call.args || {}),
          },
        });
      }
    }

    const genericMessage: Message = {
      role: 'assistant',
      content: textContent,
    };

    if (functionCalls.length > 0) {
      genericMessage.tool_calls = functionCalls;
    }

    // Calculate token usage
    const usage = response.usageMetadata ? {
      prompt_tokens: response.usageMetadata.promptTokenCount || 0,
      completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata.totalTokenCount || 0,
    } : undefined;

    return {
      message: genericMessage,
      usage,
    };
  }
}
