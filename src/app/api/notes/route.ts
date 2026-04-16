export const maxDuration = 30;
import notesHandler from '../../../../api/notes.js';
import { adaptHandler } from '../../../lib/adapt-handler';
const handle = adaptHandler(notesHandler);
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
