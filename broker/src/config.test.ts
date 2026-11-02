// Broker config tests
describe('broker config', () => {
  it('has the pinned CA path', () => {
    // Test that the CA file exists
    const fs = require('fs');
    const path = require('path');
    const caPath = '/opt/agentport-github-broker/supabase-root-2021-ca.pem';
    expect(fs.existsSync(caPath)).toBe(true);
  });
});
