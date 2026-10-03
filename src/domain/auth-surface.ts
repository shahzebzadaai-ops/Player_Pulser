/** A closed auth sheet renders nothing, including the password fallback. */
export function visibleAuthParts(open: boolean): Array<"sheet"> {
  return open ? ["sheet"] : [];
}