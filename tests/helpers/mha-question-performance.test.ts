import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { MHAQuestionsScreen } from '../../src/pages/MHAQuestionsScreen.js';
import { formatMobileLocator, mobileElements } from '../../src/pages/mobileElements.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { executionReporter } from '../../src/utils/ExecutionReporter.js';

for (const platform of ['iOS', 'Android'] as const) {
  test(`${platform} MHA preserves question verification and answer/navigation order`, async t => {
    const session = new MobileSession(platform);
    const calls: string[] = [];
    t.mock.method(executionReporter, 'log', () => {});
    t.mock.method(session, 'clickElement', async (selector: string) => { calls.push(selector); });
    _setGlobal('$', async (selector: string) => {
      calls.push(selector);
      return {
        isDisplayed: async () => true,
        getAttribute: async () => 'Question'
      };
    });
    const screen = new MHAQuestionsScreen(session);
    const answer = 'I don\'t say "yes" (often).';
    await screen.completeAssessment({
      'Mental health assessment': {
        Count: 1,
        Sections: [{ Name: 'Section', Questions: [{ Name: 'Question', Type: 'selectfield', Values: [answer] }] }]
      }

    });
    assert.equal(calls.length, 3);
    if (platform === 'iOS') {
      assert.equal(calls[0], formatMobileLocator(mobileElements.MHAQuestionsScreen.questionByIndex, { index: 0 }).ios);
      assert.ok(calls[1].startsWith('-ios predicate string:name CONTAINS "answer_option_" AND label MATCHES '));
      const pattern = JSON.parse(calls[1].split('label MATCHES ')[1]) as string;
      const regex = new RegExp(`^(?:${pattern})$`);
      assert.ok(regex.test(answer));
      assert.ok(regex.test(`  ${answer.replaceAll(' ', '\t')} \n`));
      assert.equal(regex.test('different answer'), false);
      assert.equal(regex.test(answer.replace('(often).', 'oftenX')), false);
      assert.equal(calls[2], mobileElements.MHAQuestionsScreen.submitAssessment.ios);
    } else {
      assert.equal(calls[0], "//*[@resource-id='question_0']");
      assert.ok(calls[1].includes('normalize-space(@content-desc)=concat('));
      assert.equal(calls[2], "//*[@resource-id='btn_vg_submit_button']");
    }
  });
}

for (const finalType of ['selectfield', 'information']) {
  test(`final ${finalType} question submits once without waiting for Next`, async t => {
    const session = new MobileSession('iOS');
    const screen = new MHAQuestionsScreen(session);
    const clicks: string[] = [];
    t.mock.method(executionReporter, 'log', () => {});
    t.mock.method(session, 'clickElement', async (selector: string) => { clicks.push(selector); });
    _setGlobal('$', async () => ({
      isDisplayed: async () => true,
      getAttribute: async () => 'Question'
    }));
    await screen.completeAssessment({
      'Mental health assessment': {
        Count: 2,
        Sections: [
          { Name: 'First', Questions: [{ Name: 'Question', Type: 'information' }] },
          {
            Name: 'Final',
            Questions: [
              { Name: 'Question', Type: 'information' },
              { Name: 'Question', Type: finalType, Values: ['Yes'] }
            ]
          }
        ]
      }
    });
    assert.equal(clicks.filter(selector => selector === mobileElements.MHAQuestionsScreen.questionNext.ios).length, 2);
    assert.equal(clicks.filter(selector => selector === mobileElements.MHAQuestionsScreen.submitAssessment.ios).length, 1);
    assert.equal(clicks[clicks.length - 1], mobileElements.MHAQuestionsScreen.submitAssessment.ios);
    assert.equal(clicks[1], mobileElements.MHAQuestionsScreen.sectionNext.ios);
  });
}
