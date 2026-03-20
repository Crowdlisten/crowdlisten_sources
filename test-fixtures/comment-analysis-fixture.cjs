'use strict';

function getCommentAnalysisFixture() {
  const baseVideoContext = {
    mainTopic: 'Steak cooking tutorial',
    summary: 'Creator explains how to cook steak and says to leave it at room temperature for an hour.',
    keyEntities: {
      people: ['creator'],
      objects: ['steak', 'pan'],
      locations: ['kitchen'],
    },
    timeline: [
      { start: '0:00', end: '0:20', description: 'Creator introduces the steak prep process' },
      { start: '0:20', end: '0:45', description: 'Creator explains room temperature rest and pan prep' },
    ],
    mood: 'informative',
    implicitContext: ['Food safety concerns around leaving meat out too long'],
    searchKeywordRelevance: 'high',
    audioTrack: 'none',
    callsToAction: ['Comment below'],
    emotionalArc: 'steady',
    processingTimeMs: 1,
  };

  const videoContexts = {
    v1: {
      ...baseVideoContext,
      keyMoments: [{ timestamp: '0:42', description: 'Creator says steak can sit at room temperature for an hour' }],
      controversialMoments: [{ timestamp: '0:42', description: 'Creator says steak can sit at room temperature for an hour' }],
      transcript: 'Let your steak sit at room temperature for at least an hour.\nDo not move it once it hits the pan.',
      visualText: ['Room temp 1 hour', 'Do not move steak'],
      videoId: 'v1',
    },
    v2: {
      ...baseVideoContext,
      summary: 'Another creator gives similar steak advice and viewers debate the safety of leaving meat out.',
      keyMoments: [{ timestamp: '0:30', description: 'Creator repeats the one hour room temperature advice' }],
      controversialMoments: [{ timestamp: '0:30', description: 'Creator repeats the one hour room temperature advice' }],
      transcript: 'I always let steak sit out for an hour before cooking.\nThat is the only way I do it.',
      visualText: ['Let steak rest 1 hour', 'Best steak method'],
      videoId: 'v2',
    },
  };

  const comments = {
    v1: [
      {
        id: 'c1',
        author: { id: 'u1', username: 'chefwatcher' },
        text: 'that part is unsafe',
        timestamp: new Date('2026-03-10T00:00:00Z'),
        likes: 12,
        replies: [
          {
            id: 'c1r1',
            author: { id: 'u2', username: 'replyguy' },
            text: 'same',
            timestamp: new Date('2026-03-10T01:00:00Z'),
            likes: 3,
            replies: [],
          },
        ],
      },
      {
        id: 'c2',
        author: { id: 'u3', username: 'panfan' },
        text: 'do not move it once it hits the pan is actually useful',
        timestamp: new Date('2026-03-10T02:00:00Z'),
        likes: 9,
        replies: [],
      },
      {
        id: 'c3',
        author: { id: 'u4', username: 'joker' },
        text: 'lol',
        timestamp: new Date('2026-03-10T03:00:00Z'),
        likes: 1,
        replies: [],
      },
      {
        id: 'c4',
        author: { id: 'u7', username: 'forgetfulviewer' },
        text: "Very informative. I won't remember any of them.",
        timestamp: new Date('2026-03-10T04:00:00Z'),
        likes: 5,
        replies: [],
      },
      {
        id: 'c5',
        author: { id: 'u8', username: 'genericpraise' },
        text: 'Great tips keep it up',
        timestamp: new Date('2026-03-10T05:00:00Z'),
        likes: 4,
        replies: [],
      },
    ],
    v2: [
      {
        id: 'd1',
        author: { id: 'u5', username: 'foodsafety' },
        text: 'leaving steak out that long is risky',
        timestamp: new Date('2026-03-11T00:00:00Z'),
        likes: 15,
        replies: [],
      },
      {
        id: 'd2',
        author: { id: 'u6', username: 'questioner' },
        text: 'what temp should the pan be?',
        timestamp: new Date('2026-03-11T01:00:00Z'),
        likes: 4,
        replies: [],
      },
    ],
  };

  const groundingExpectations = [
    {
      commentId: 'c1',
      expectedPrimaryAnchorIncludes: ['moment_0_42', 'room_temperature_for_an_hour'],
    },
    {
      commentId: 'c1r1',
      expectedPrimaryAnchorIncludes: ['moment_0_42', 'room_temperature_for_an_hour'],
    },
    {
      commentId: 'c2',
      expectedPrimaryAnchorIncludes: ['quote_1', 'do_not_move_it_once_it_hits_the_pan'],
    },
    {
      commentId: 'd1',
      expectedPrimaryAnchorIncludes: ['moment_0_30', 'room_temperature_advice'],
    },
    {
      commentId: 'd2',
      expectedPrimaryAnchorIncludes: ['object_pan', 'pan'],
    },
    {
      commentId: 'c5',
      expectedPrimaryAnchorIncludes: ['global_video'],
    },
  ];

  const expectedUnitLabels = {
    c1_unit_1: 'room_temp_safety_negative',
    c1r1_unit_1: 'room_temp_safety_negative',
    c2_unit_1: 'pan_handling_positive',
    c3_unit_1: 'reaction_noise',
    c4_unit_1: 'retention_negative',
    c5_unit_1: 'generic_video_praise',
    d1_unit_1: 'room_temp_safety_negative',
    d2_unit_1: 'pan_temperature_question',
  };

  const opinionUnitExpectations = [
    {
      commentId: 'c4',
      expectedUnitCount: 1,
      requiredSpanIncludes: ["won't remember any of them"],
      forbiddenSpanIncludes: ['Very informative'],
      expectedStance: 'negative',
    },
  ];

  return {
    videoContexts,
    comments,
    groundingExpectations,
    expectedUnitLabels,
    opinionUnitExpectations,
  };
}

module.exports = {
  getCommentAnalysisFixture,
};
