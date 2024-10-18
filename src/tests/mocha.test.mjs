import { assert } from 'chai';

describe('Mocha configuration tests', function() {
  describe('#indexOf()', function() {
    it('should return -1 when the value is not present', function() {
      const array = [1, 2, 3];
      const valueToFind = 4;
      const result = array.indexOf(valueToFind);

      assert.strictEqual(result, -1, `Expected indexOf(${valueToFind}) to be -1`);
    });

    it('should return the correct index when the value is present', function() {
      const array = [1, 2, 3];
      const valueToFind = 2;
      const result = array.indexOf(valueToFind);

      assert.strictEqual(result, 1, `Expected indexOf(${valueToFind}) to be 1`);
    });
  });
});
