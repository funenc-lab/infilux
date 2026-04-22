export function setGroupBottomBarHeight(
  heightsByGroupId: Record<string, number>,
  groupId: string,
  height: number
): Record<string, number> {
  if (heightsByGroupId[groupId] === height) {
    return heightsByGroupId;
  }

  return {
    ...heightsByGroupId,
    [groupId]: height,
  };
}

export function clearGroupBottomBarHeight(
  heightsByGroupId: Record<string, number>,
  groupId: string
): Record<string, number> {
  if (!(groupId in heightsByGroupId)) {
    return heightsByGroupId;
  }

  const { [groupId]: _removedHeight, ...remainingHeights } = heightsByGroupId;
  return remainingHeights;
}
