import type { Action, FormatConverter, Session, Step } from '../types';
import { blobToBase64, resizeScreenshotBlob } from '../utils/screenshot';

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic Messages API converter: valid POST /v1/messages body with computer
// tool use. First step screenshot is the seed observation; each action maps to
// a tool_use block + tool_result with the NEXT screenshot.
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_ACTION_MAP: Record<string, string> = {
  click: 'left_click',
  double_click: 'double_click',
  right_click: 'right_click',
  type: 'type',
  key: 'key',
  scroll: 'scroll',
  drag: 'left_click_drag',
  wait: 'wait',
};

function mapAnthropicAction(action: Action): string | null {
  return ANTHROPIC_ACTION_MAP[action.type] ?? null;
}

function buildToolInput(action: Action): Record<string, unknown> {
  const mapped = mapAnthropicAction(action);
  if (!mapped) return {};

  const input: Record<string, unknown> = { action: mapped };

  if (action.coordinate) {
    input.coordinate = action.coordinate;
  }

  if (action.type === 'type' && action.text !== undefined) {
    input.text = action.text;
  }

  if (action.type === 'key' && action.key !== undefined) {
    input.text = action.key;
  }

  if (action.type === 'scroll') {
    if (action.scroll_direction) {
      const dirMap: Record<string, string> = { up: 'up', down: 'down' };
      input.scroll_direction = dirMap[action.scroll_direction] ?? 'down';
      input.scroll_amount = action.scroll_amount ?? 5;
    }
  }

  if (action.type === 'wait' && action.duration !== undefined) {
    input.duration = Math.round(action.duration);
  }

  return input;
}

async function encodeScreenshot(
  step: Step | undefined,
  screenshots: Map<string, Blob>,
): Promise<string | null> {
  if (!step?.screenshot) return null;
  const blob = screenshots.get(step.screenshot.hash);
  if (!blob) return null;
  const resized = await resizeScreenshotBlob(blob);
  return blobToBase64(resized);
}

export const anthropicConverter: FormatConverter = {
  key: 'anthropic',
  name: 'Anthropic Messages',
  filename: 'anthropic.json',

  async convert(session: Session, screenshots: Map<string, Blob>): Promise<string> {
    const steps = session.steps.filter((s) => s.action.type !== 'screenshot');
    const messages: unknown[] = [];

    // Derive goal from first segment label or default
    const goal =
      session.segments.length > 0 && session.segments[0].label
        ? session.segments[0].label
        : 'Browser task';

    // Seed message: user with goal text + first screenshot
    const firstScreenshotB64 = await encodeScreenshot(steps[0], screenshots);
    const userContent: unknown[] = [{ type: 'text', text: goal }];
    if (firstScreenshotB64) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: firstScreenshotB64,
        },
      });
    }
    messages.push({ role: 'user', content: userContent });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const mapped = mapAnthropicAction(step.action);
      if (!mapped) continue;

      const toolUseId = `toolu_${i}`;
      const input = buildToolInput(step.action);

      // Assistant message with tool_use
      messages.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: toolUseId,
            name: 'computer',
            input,
          },
        ],
      });

      // User message with tool_result containing NEXT screenshot
      const nextStep = steps[i + 1] ?? step;
      const nextScreenshotB64 = await encodeScreenshot(nextStep, screenshots);

      const resultContent: unknown[] = [];
      if (nextScreenshotB64) {
        resultContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: nextScreenshotB64,
          },
        });
      } else {
        resultContent.push({ type: 'text', text: 'screenshot unavailable' });
      }

      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: resultContent,
          },
        ],
      });
    }

    const output = {
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4096,
      tools: [
        {
          type: 'computer_20251124',
          name: 'computer',
          display_width_px: session.environment.display_width,
          display_height_px: session.environment.display_height,
        },
      ],
      messages,
    };

    return JSON.stringify(output, null, 2);
  },
};
