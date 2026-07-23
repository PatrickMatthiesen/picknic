const nonTextModelPattern =
  /(?:image|audio|realtime|transcrib|speech|tts|embedding|moderation|computer-use)/i;

function compareGptVersionsDescending(left: string, right: string): number {
  const versionFor = (model: string) =>
    model
      .match(/^gpt-(\d+(?:\.\d+)*)/i)?.[1]
      ?.split(".")
      .map(Number) ?? [];

  const leftVersion = versionFor(left);
  const rightVersion = versionFor(right);
  const length = Math.max(leftVersion.length, rightVersion.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (rightVersion[index] ?? 0) - (leftVersion[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return left.length - right.length || left.localeCompare(right);
}

export function selectAvailableAiModel(preferredModel: string, modelIds: string[]): string | null {
  const available = [...new Set(modelIds.map((model) => model.trim()).filter(Boolean))];
  const preferred = available.find(
    (model) => model.localeCompare(preferredModel.trim(), undefined, { sensitivity: "accent" }) === 0,
  );
  if (preferred) {
    return preferred;
  }

  const textModels = available.filter((model) => !nonTextModelPattern.test(model));
  const smallGptModels = textModels
    .filter((model) => /^gpt-\d+(?:\.\d+)*-mini(?:$|-)/i.test(model))
    .sort(compareGptVersionsDescending);
  if (smallGptModels[0]) {
    return smallGptModels[0];
  }

  const gptModels = textModels
    .filter((model) => /^gpt-\d/i.test(model))
    .sort(compareGptVersionsDescending);
  if (gptModels[0]) {
    return gptModels[0];
  }

  return textModels.sort((left, right) => left.localeCompare(right))[0] ?? null;
}
