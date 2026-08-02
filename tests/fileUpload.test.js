const { createUploadMiddleware } = require('../utils/fileUpload');

describe('file upload utility', () => {
  it('creates an upload middleware without throwing', () => {
    expect(typeof createUploadMiddleware).toBe('function');
    expect(typeof createUploadMiddleware('services', 3)).toBe('function');
  });
});
