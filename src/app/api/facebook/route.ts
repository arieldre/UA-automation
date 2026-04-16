export const maxDuration = 60;
import facebookHandler from '../../../../api/facebook.js';
import { adaptHandler } from '../../../lib/adapt-handler';
export const GET = adaptHandler(facebookHandler);
