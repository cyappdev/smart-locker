import { createHealthRouter } from '../routes/health.route.ts';

export const composeSystem = () => {
  return {
    healthRouter: createHealthRouter(),
  };
};
