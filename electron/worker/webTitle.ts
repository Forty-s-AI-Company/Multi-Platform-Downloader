import { getWebpageMetadata } from "./webMetadata.js";

export async function getWebpageTitle(url: string): Promise<string | null> {
  const metadata = await getWebpageMetadata(url);
  return metadata.title;
}
