import type { Action, FormatConverter, Session, Step } from '../types';
import { blobToBase64, resizeScreenshotBlob } from '../utils/screenshot';

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Responses API converter: valid POST /v1/responses body with computer
// tool. Each action maps to a computer_call + computer_call_output pair.
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_ACTION_MAP: Record<string, string> = {
  click: 'left_click',
  double_click: 'double_click',
  right_click: 'right_click',
  type: 'type',
  key: 'key',
  scroll: 'scroll',
  drag: 'left_click_drag',
  wait: 'wait',
};

function mapOpenAIAction(action: Action): string | null {
  return OPENAI_ACTION_MAP[action.type] ?? null;
}

function buildActionObject(action: Action): Record<string, unknown> {
  const mapped = mapOpenAIAction(action);
  if (!mapped) return {};

  const obj: Record<string, unknown> = { type: mapped };

  if (action.coordinate) {
    obj.x = action.coordinate[0];
    obj.y = action.coordinate[1];
  }

  if (action.type === 'type' && action.text !== undefined) {
    obj.text = action.text;
  }

  if (action.type === 'key') {
    if (action.key) {
      obj.keys = action.key.split('+').map((k) => k.trim());
    }
  }

  if (action.type === 'scroll') {
    const amount = action.scroll_amount ?? 5;
    if (action.scroll_direction === 'down') {
      obj.scroll_amount = amount;
    } else if (action.scroll_direction === 'up') {
      obj.scroll_amount = -amount;
    }
  }

  return obj;
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

export const openaiConverter: FormatConverter = {
  key: 'openai',
  name: 'OpenAI Responses',
  filename: 'openai.json',

  async convert(session: Session, screenshots: Map<string, Blob>): Promise<string> {
    const steps = session.steps.filter((s) => s.action.type !== 'screenshot');
    const input: unknown[] = [];

    // Derive goal from first segment label or default
    const goal =
      session.segments.length > 0 && session.segments[0].label
        ? session.segments[0].label
        : 'Browser task';

    // Seed input: user message with goal + first screenshot
    const firstScreenshotB64 = await encodeScreenshot(steps[0], screenshots);
    const seedContent: unknown[] = [{ type: 'input_text', text: goal }];
    if (firstScreenshotB64) {
      seedContent.push({
        type: 'input_image',
        image_url: `data:image/png;base64,${firstScreenshotB64}`,
      });
    }
    input.push({ type: 'message', role: 'user', content: seedContent });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const mapped = mapOpenAIAction(step.action);
      if (!mapped) continue;

      const callId = `call_${i}`;

      // Computer call
      const actionObj = buildActionObject(step.action);
      input.push({
        type: 'computer_call',
        id: `cu_${i}`,
        call_id: callId,
        action: actionObj,
        pending_safety_checks: [],
        status: 'completed',
      });

      // Computer call output with NEXT screenshot
      const nextStep = steps[i + 1] ?? step;
      const nextScreenshotB64 = await encodeScreenshot(nextStep, screenshots);

      input.push({
        type: 'computer_call_output',
        call_id: callId,
        output: {
          type: 'computer_screenshot',
          image_url: nextScreenshotB64 ? `data:image/png;base64,${nextScreenshotB64}` : '',
        },
      });
    }

    const output = {
      model: 'gpt-5.5-preview',
      tools: [
        {
          type: 'computer_use_preview',
          display_width: session.environment.display_width,
          display_height: session.environment.display_height,
          environment: 'browser',
        },
      ],
      input,
    };

    return JSON.stringify(output, null, 2);
  },
};
