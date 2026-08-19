// Font-loading port: resolves once the family is requested and (where the
// CSS Font Loading API exists) its faces have settled.
export interface IFontLoader {
  ensureFont(family: string): Promise<void>;
}
