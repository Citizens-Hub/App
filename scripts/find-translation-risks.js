import path from 'node:path';
import ts from 'typescript';

const ICON_PROP_NAMES = ['startIcon', 'endIcon', 'icon', 'avatar'];
const FORMATTED_COMPONENTS_RENDER_AS_ELEMENTS = true;
const TEXT_COMPONENT_PATTERN = /^Formatted[A-Z]/;

function loadProgram(projectPath) {
  const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext([configFile.error], createFormatHost()));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(projectPath),
  );

  if (parsedConfig.errors.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(parsedConfig.errors, createFormatHost()));
  }

  return ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
}

function createFormatHost() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  };
}

function getTagName(node) {
  const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tagName.getText();
}

function getLine(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function isTextComponent(tagName) {
  if (FORMATTED_COMPONENTS_RENDER_AS_ELEMENTS && TEXT_COMPONENT_PATTERN.test(tagName)) {
    return false;
  }

  return TEXT_COMPONENT_PATTERN.test(tagName);
}

function getIconPropNames(openingElement) {
  const names = [];

  for (const prop of openingElement.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) {
      continue;
    }

    if (ICON_PROP_NAMES.includes(prop.name.text)) {
      names.push(prop.name.text);
    }
  }

  return names;
}

function classifyJsxChild(child, checker) {
  if (ts.isJsxText(child)) {
    return child.getFullText().trim() ? 'text' : 'ignore';
  }

  if (ts.isJsxExpression(child)) {
    return classifyExpression(child.expression, checker);
  }

  if (ts.isJsxElement(child)) {
    return isTextComponent(getTagName(child)) ? 'text' : 'element';
  }

  if (ts.isJsxSelfClosingElement(child)) {
    return isTextComponent(getTagName(child)) ? 'text' : 'element';
  }

  if (ts.isJsxFragment(child)) {
    const kinds = child.children
      .map((nestedChild) => classifyJsxChild(nestedChild, checker))
      .filter((kind) => kind !== 'ignore');

    if (kinds.length === 0) {
      return 'ignore';
    }

    if (kinds.every((kind) => kind === 'text')) {
      return 'text';
    }

    if (kinds.every((kind) => kind === 'element')) {
      return 'element';
    }

    return 'expr';
  }

  return 'expr';
}

function classifyExpression(expression, checker) {
  if (!expression) {
    return 'ignore';
  }

  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return classifyExpression(expression.expression, checker);
  }

  if (
    ts.isStringLiteralLike(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression) ||
    ts.isTemplateExpression(expression) ||
    ts.isNumericLiteral(expression)
  ) {
    return 'text';
  }

  if (ts.isJsxElement(expression)) {
    return isTextComponent(getTagName(expression)) ? 'text' : 'element';
  }

  if (ts.isJsxSelfClosingElement(expression)) {
    return isTextComponent(getTagName(expression)) ? 'text' : 'element';
  }

  if (ts.isJsxFragment(expression)) {
    const kinds = expression.children
      .map((child) => classifyJsxChild(child, checker))
      .filter((kind) => kind !== 'ignore');

    if (kinds.length === 0) {
      return 'ignore';
    }

    if (kinds.every((kind) => kind === 'text')) {
      return 'text';
    }

    if (kinds.every((kind) => kind === 'element')) {
      return 'element';
    }

    return 'expr';
  }

  if (ts.isConditionalExpression(expression)) {
    return mergeKinds([
      classifyExpression(expression.whenTrue, checker),
      classifyExpression(expression.whenFalse, checker),
    ]);
  }

  if (ts.isBinaryExpression(expression)) {
    if (
      expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      return mergeKinds([
        classifyExpression(expression.left, checker),
        classifyExpression(expression.right, checker),
      ]);
    }
  }

  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.PlusToken) {
    return classifyExpression(expression.operand, checker);
  }

  if (ts.isCallExpression(expression) && isFormatMessageCall(expression)) {
    return 'text';
  }

  if (isRenderableTextType(checker.getTypeAtLocation(expression))) {
    return 'text';
  }

  return 'expr';
}

function mergeKinds(kinds) {
  const filteredKinds = kinds.filter((kind) => kind !== 'ignore');

  if (filteredKinds.length === 0) {
    return 'ignore';
  }

  if (filteredKinds.every((kind) => kind === 'text')) {
    return 'text';
  }

  if (filteredKinds.every((kind) => kind === 'element')) {
    return 'element';
  }

  return 'expr';
}

function isFormatMessageCall(expression) {
  const called = expression.expression;

  if (ts.isIdentifier(called)) {
    return called.text === 'formatMessage';
  }

  if (ts.isPropertyAccessExpression(called)) {
    return called.name.text === 'formatMessage';
  }

  return false;
}

function isRenderableTextType(type) {
  const unionParts = type.isUnion() ? type.types : [type];
  let hasTextLikePart = false;

  for (const unionPart of unionParts) {
    const flags = unionPart.getFlags();

    if (
      (flags & ts.TypeFlags.StringLike) !== 0 ||
      (flags & ts.TypeFlags.NumberLike) !== 0 ||
      (flags & ts.TypeFlags.BigIntLike) !== 0
    ) {
      hasTextLikePart = true;
      continue;
    }

    if (
      (flags & ts.TypeFlags.BooleanLike) !== 0 ||
      (flags & ts.TypeFlags.Null) !== 0 ||
      (flags & ts.TypeFlags.Undefined) !== 0 ||
      (flags & ts.TypeFlags.Void) !== 0 ||
      (flags & ts.TypeFlags.Never) !== 0
    ) {
      continue;
    }

    return false;
  }

  return hasTextLikePart;
}

function collectFindings(program) {
  const checker = program.getTypeChecker();
  const findings = [];
  const cwd = process.cwd();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || !sourceFile.fileName.includes(`${path.sep}src${path.sep}`)) {
      continue;
    }

    function visit(node) {
      if (ts.isJsxElement(node)) {
        const openingElement = node.openingElement;
        const tag = getTagName(node);
        const childKinds = node.children
          .map((child) => classifyJsxChild(child, checker))
          .filter((kind) => kind !== 'ignore');
        const textChildren = childKinds.filter((kind) => kind === 'text').length;
        const elementChildren = childKinds.filter((kind) => kind === 'element').length;
        const iconPropNames = getIconPropNames(openingElement);

        if (iconPropNames.length > 0 && textChildren > 0) {
          findings.push({
            file: path.relative(cwd, sourceFile.fileName),
            line: getLine(sourceFile, openingElement.getStart(sourceFile)),
            tag,
            type: 'icon-prop-text',
            detail: `text-like child rendered with icon prop(s): ${iconPropNames.join(', ')}`,
          });
        }

        if (textChildren > 0 && elementChildren > 0) {
          findings.push({
            file: path.relative(cwd, sourceFile.fileName),
            line: getLine(sourceFile, openingElement.getStart(sourceFile)),
            tag,
            type: 'mixed-children',
            detail: 'direct text-like children are mixed with element children',
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return findings.sort((left, right) => {
    return left.file.localeCompare(right.file)
      || left.line - right.line
      || left.type.localeCompare(right.type);
  });
}

function printFindings(findings) {
  const highRisk = findings.filter((finding) => finding.type === 'icon-prop-text');
  const mediumRisk = findings.filter((finding) => finding.type === 'mixed-children');

  console.log('Translation DOM mutation risks');
  console.log(`High risk   icon-prop-text : ${highRisk.length}`);
  console.log(`Medium risk mixed-children : ${mediumRisk.length}`);
  console.log(`Total findings            : ${findings.length}`);
  console.log('');

  for (const finding of findings) {
    const severity = finding.type === 'icon-prop-text' ? 'HIGH' : 'MED ';
    console.log(`[${severity}] ${finding.file}:${finding.line} <${finding.tag}> ${finding.detail}`);
  }
}

function main() {
  const projectPath = path.resolve(process.cwd(), 'tsconfig.app.json');
  const program = loadProgram(projectPath);
  const findings = collectFindings(program);
  printFindings(findings);
}

main();
