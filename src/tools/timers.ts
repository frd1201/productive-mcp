import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveTimer, ProductiveTimerCreate } from '../api/types.js';
import { formatMinutesDisplay } from './time-entries.js';

const getTimerSchema = z.object({
  timer_id: z.string().min(1, 'Timer ID is required'),
});

const startTimerSchema = z.object({
  service_id: z.string().optional(),
  time_entry_id: z.string().optional(),
}).refine(
  (data) => data.service_id || data.time_entry_id,
  { message: 'Either service_id or time_entry_id must be provided' }
);

const stopTimerSchema = z.object({
  timer_id: z.string().min(1, 'Timer ID is required'),
});

function formatTimerResponse(action: string, timer: ProductiveTimer): { content: Array<{ type: string; text: string }> } {
  const isRunning = timer.attributes.stopped_at === null;
  let text = `Timer ${action}!\n`;
  text += `ID: ${timer.id}\n`;
  text += `Status: ${isRunning ? 'Running' : 'Stopped'}\n`;
  text += `Started at: ${timer.attributes.started_at}`;

  if (timer.attributes.stopped_at) {
    text += `\nStopped at: ${timer.attributes.stopped_at}`;
  }

  if (timer.attributes.total_time > 0) {
    text += `\nTotal time: ${formatMinutesDisplay(timer.attributes.total_time)}`;
  }

  const timeEntryId = timer.relationships?.time_entry?.data?.id;
  if (timeEntryId) {
    text += `\nTime Entry ID: ${timeEntryId}`;
  }

  return { content: [{ type: 'text', text }] };
}

export async function getTimerTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getTimerSchema.parse(args);
    const response = await client.getTimer(params.timer_id);
    return formatTimerResponse('found', response.data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export async function startTimerTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = startTimerSchema.parse(args);

    const timerData: ProductiveTimerCreate = {
      data: {
        type: 'timers',
        attributes: {},
        relationships: {},
      },
    };

    if (params.time_entry_id) {
      timerData.data.relationships.time_entry = {
        data: { id: params.time_entry_id, type: 'time_entries' },
      };
    } else if (params.service_id) {
      timerData.data.relationships.service = {
        data: { id: params.service_id, type: 'services' },
      };
    }

    const response = await client.createTimer(timerData);
    return formatTimerResponse('started', response.data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export async function stopTimerTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = stopTimerSchema.parse(args);
    const response = await client.stopTimer(params.timer_id);
    return formatTimerResponse('stopped', response.data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const getTimerDefinition = {
  name: 'get_timer',
  description: 'Get a timer by ID to check its status (running or stopped). Use this to verify if a timer is still running.',
  inputSchema: {
    type: 'object',
    properties: {
      timer_id: {
        type: 'string',
        description: 'ID of the timer to check (required)',
      },
    },
    required: ['timer_id'],
  },
};

export const startTimerDefinition = {
  name: 'start_timer',
  description: 'Start a new timer for time tracking. Provide a valid service_id (use list_services to find available services) or a time_entry_id to attach to an existing time entry. The service_id creates a new time entry automatically.',
  inputSchema: {
    type: 'object',
    properties: {
      service_id: {
        type: 'string',
        description: 'Service ID to track time against (creates new time entry). Required if time_entry_id not provided.',
      },
      time_entry_id: {
        type: 'string',
        description: 'Existing time entry ID to attach timer to. Required if service_id not provided.',
      },
    },
  },
};

export const stopTimerDefinition = {
  name: 'stop_timer',
  description: `Stop a running timer. The timer's total_time will be added to the associated time entry.`,
  inputSchema: {
    type: 'object',
    properties: {
      timer_id: {
        type: 'string',
        description: 'ID of the timer to stop (required)',
      },
    },
    required: ['timer_id'],
  },
};
