import { SetMetadata } from '@nestjs/common';

export const SESSION_PROFILE = 'burnoutsense:session-profile';
export const WithSessionProfile = () => SetMetadata(SESSION_PROFILE, true);
