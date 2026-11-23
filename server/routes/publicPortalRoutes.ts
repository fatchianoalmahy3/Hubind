import type { Express } from 'express';
import { registerPublicStudentRoutes } from './public/publicStudentRoutes';
import { registerPublicTeacherMonitoringRoutes } from './public/publicTeacherMonitoringRoutes';

export function registerPublicPortalRoutes(app: Express): void {
  registerPublicStudentRoutes(app);
  registerPublicTeacherMonitoringRoutes(app);
}
