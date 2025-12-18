import * as astroPlugin from 'prettier-plugin-astro';

const config = {
  plugins: [astroPlugin],
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 100,
};

export default config;
