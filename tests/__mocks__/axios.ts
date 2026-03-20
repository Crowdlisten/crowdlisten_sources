/**
 * Global axios mock for tests.
 * Provides a mock axios instance with get/post/put/delete methods.
 */

const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
  defaults: { headers: { common: {} } },
};

const axios = {
  create: jest.fn(() => mockAxiosInstance),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  isAxiosError: jest.fn((err: any) => err?.isAxiosError === true),
  defaults: { headers: { common: {} } },
};

export default axios;
export { mockAxiosInstance };
