import { JWTService } from '../../../src/infra/authentication/jwt-service';

describe('JWTService', () => {
  let jwtService: JWTService;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    jwtService = new JWTService();
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  describe('generate', () => {
    it('should generate a valid JWT token', () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const token = jwtService.generate(payload);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate token with default expiration', () => {
      const payload = { userId: '123' };
      const token = jwtService.generate(payload);

      const decoded = jwtService.verify(token) as any;
      expect(decoded.userId).toBe('123');
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should generate token with custom expiration', () => {
      const payload = { userId: '123' };
      const token = jwtService.generate(payload, '2h');

      const decoded = jwtService.verify(token) as any;
      expect(decoded.userId).toBe('123');
    });
  });

  describe('verify', () => {
    it('should verify a valid token', () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const token = jwtService.generate(payload);

      const decoded = jwtService.verify(token);
      expect(decoded).toMatchObject(payload);
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => jwtService.verify(invalidToken)).toThrow('Invalid token');
    });

    it('preserves the original jsonwebtoken error as `cause`', () => {
      const invalidToken = 'invalid.token.here';

      try {
        jwtService.verify(invalidToken);
        fail('expected verify() to throw');
      } catch (error) {
        expect((error as Error).cause).toBeInstanceOf(Error);
        expect(((error as Error).cause as Error).name).toBe('JsonWebTokenError');
      }
    });
  });
});