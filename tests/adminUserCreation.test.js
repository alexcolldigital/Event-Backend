describe('admin user creation flow', () => {
  it('exposes a createUser controller and a POST /admin/users route', () => {
    const adminController = require('../controllers/adminController');
    const adminRoutes = require('../routes/adminRoutes');

    expect(typeof adminController.createUser).toBe('function');

    const userRouteLayers = adminRoutes.stack.filter(
      (layer) => layer.route && layer.route.path === '/users'
    );

    expect(userRouteLayers.some((layer) => layer.route.methods.post)).toBe(true);
  });
});
