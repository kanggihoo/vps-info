import { describe, expect, it } from 'vitest';
import { feedDefinitions, feedGroupDefinitions } from './feed-definitions.ts';

describe('feedDefinitions', () => {
  it('Feed id가 겹치지 않는다', () => {
    const ids = feedDefinitions.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('feedGroupDefinitions (ADR-0010)', () => {
  it.each(feedGroupDefinitions)('$id: 선언된 축과 값만 쓰고, 변형이 겹치지 않으며, 종류가 모두 같다', (group) => {
    const members = feedDefinitions.filter((definition) => definition.group?.id === group.id);
    expect(members.length).toBeGreaterThan(1);

    for (const member of members) {
      const variant = member.group?.variant ?? {};
      expect(Object.keys(variant).toSorted()).toEqual(group.axes.map((axis) => axis.key).toSorted());
      for (const axis of group.axes) expect(axis.values.map((axisValue) => axisValue.value)).toContain(variant[axis.key]);
    }

    const variantKeys = members.map((member) => group.axes.map((axis) => member.group?.variant[axis.key]).join('/'));
    expect(new Set(variantKeys).size).toBe(members.length);
    expect(new Set(members.map((member) => member.kind ?? 'stream')).size).toBe(1);
  });

  it('Feed가 가리키는 Group은 모두 선언되어 있다', () => {
    const groupIds = new Set(feedGroupDefinitions.map((group) => group.id));
    for (const definition of feedDefinitions) if (definition.group) expect(groupIds).toContain(definition.group.id);
  });
});
