import type { BunPlugin } from 'bun'

/**
 * Bun build plugin that transforms WebTUI attributes containing special
 * characters (^, ~, $) into JSX spread syntax, since Bun's JSX parser
 * doesn't support these characters in attribute names.
 *
 * e.g. align-^="center" → {...{"align-^":"center"}}
 */
export const webtuiPlugin: BunPlugin = {
  name: "webtui-jsx",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      let source = await Bun.file(args.path).text()
      // Only transform files that actually use these special attributes
      if (/\w+-[~^$]=/.test(source)) {
        source = source.replace(
          /(\w+-[~^$])="([^"]*)"/g,
          '{...{"$1":"$2"}}'
        )
      }
      return { contents: source, loader: "tsx" }
    })
  }
}
