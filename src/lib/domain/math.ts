import { create, all } from 'mathjs';

const math = create(all, {}) as any;

export function evaluateFormula(expression: string, scope: Record<string, number>): number {
  const safeScope = Object.fromEntries(
    Object.entries(scope).map(([k, v]) => [k, Number(v) || 0])
  );
  
  try {
    const node = math.parse(expression);
    
    // Validate that the tree only contains allowed node types and functions
    node.traverse(function (n: any) {
      switch (n.type) {
        case 'OperatorNode':
        case 'ConstantNode':
        case 'SymbolNode':
        case 'ParenthesisNode':
          break;
        case 'FunctionNode':
          const allowedFns = ['add', 'subtract', 'multiply', 'divide', 'round', 'min', 'max', 'abs'];
          if (!allowedFns.includes(n.fn.name)) {
             throw new Error(`Unauthorized function: ${n.fn.name}`);
          }
          break;
        default:
          throw new Error(`Unauthorized operation: ${n.type}`);
      }
    });

    const compiled = node.compile();
    const result = compiled.evaluate(safeScope);
    return Number(result);
  } catch (e: any) {
    throw new Error(`Failed to evaluate formula '${expression}': ${e.message}`);
  }
}

export function checkInvariant(left: any, op: string, right: any): boolean {
  if (op === 'not_null') {
    return left !== null && left !== undefined && left !== "" && !Number.isNaN(left);
  }
  if (op === 'not_empty') {
    return left !== null && left !== undefined && left !== "";
  }
  if (op === 'value_eq') {
    return String(left).toLowerCase() === String(right).toLowerCase();
  }
  
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (Number.isNaN(rightNum) || Number.isNaN(leftNum)) return false;

  const EPSILON = 0.0001;

  switch (op) {
    case 'gt': return leftNum > rightNum;
    case 'gte': return leftNum >= rightNum;
    case 'lt': return leftNum < rightNum;
    case 'lte': return leftNum <= rightNum;
    case 'eq': return Math.abs(leftNum - rightNum) < EPSILON;
    case 'neq': return Math.abs(leftNum - rightNum) >= EPSILON;
    default: return false;
  }
}
