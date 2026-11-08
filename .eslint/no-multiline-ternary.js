export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      useIfElse: 'Use if/else instead of a multiline ternary expression.',
    },
  },
  create(context) {
    return {
      ConditionalExpression(node) {
        if (node.loc.start.line !== node.loc.end.line) {
          context.report({ node, messageId: 'useIfElse' })
        }
      },
    }
  },
}
