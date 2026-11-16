import assert from 'node:assert/strict';
import { loadAssessmentResource, type AssessmentDocument } from '../config/assessmentResource.js';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { expectedText, formatMobileLocator, mobileElements } from './mobileElements.js';

export class MHAQuestionsScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assert1stSectionHeader(): Promise<void> {
    await this.assertTextEquals(await this.element(mobileElements.MHAQuestionsScreen.firstSectionHeading.android,
      mobileElements.MHAQuestionsScreen.firstSectionHeading.ios), expectedText(mobileElements.MHAQuestionsScreen.firstSectionHeading));
  }

  clickSectionNextButton(): Promise<void> {
    return this.click(mobileElements.MHAQuestionsScreen.sectionNext.android,
      mobileElements.MHAQuestionsScreen.sectionNext.ios);
  }

  clickQuestionNextButton(): Promise<void> {
    return this.click(mobileElements.MHAQuestionsScreen.questionNext.android,
       mobileElements.MHAQuestionsScreen.questionNext.ios);
  }

  clickSubmitAssessmentButton(): Promise<void> {
    return this.click(mobileElements.MHAQuestionsScreen.submitAssessment.android,
      mobileElements.MHAQuestionsScreen.submitAssessment.ios);
  }

  async assertUnansweredQuestionNextDisabled(expectedQuestion: string): Promise<void> {
    await this.assertQuestion(0, normalizeConfiguredText(expectedQuestion));
    const nextButton = await this.element(
      mobileElements.MHAQuestionsScreen.nextButton.android, mobileElements.MHAQuestionsScreen.nextButton.ios
    );
    await this.assertCondition(async () => !await nextButton.isEnabled(), 'MHA Next must be disabled before selecting an answer');
    await this.assertQuestion(0, normalizeConfiguredText(expectedQuestion));
  }

  closeAssessment(): Promise<void> {
    return this.click(mobileElements.MHAQuestionsScreen.closeAssessment.android, mobileElements.MHAQuestionsScreen.closeAssessment.ios);
  }

  async confirmAssessmentExit(): Promise<void> {
    await this.assertTextEquals(
      await this.element(
        mobileElements.MHAQuestionsScreen.exitConfirmation.android,
        mobileElements.MHAQuestionsScreen.exitConfirmation.ios
      ),
      expectedText(mobileElements.MHAQuestionsScreen.exitConfirmation)
    );
    await this.click(mobileElements.MHAQuestionsScreen.confirmExit.android, mobileElements.MHAQuestionsScreen.confirmExit.ios);
  }

  async assertquestions(): Promise<void> {
    await this.assertTextEquals(await this.element(mobileElements.MHAQuestionsScreen.firstQuestion.android,
      mobileElements.MHAQuestionsScreen.firstQuestion.ios), expectedText(mobileElements.MHAQuestionsScreen.firstQuestion));
  }

  async assertSectionName(expectedSectionName: string): Promise<void> {
    await this.assertTextEquals(await this.element(mobileElements.MHAQuestionsScreen.sectionName.android, mobileElements.MHAQuestionsScreen.sectionName.ios), expectedSectionName);
  }

  async assertAnswer(): Promise<void> {
    await this.assertTextEquals(await this.element(mobileElements.MHAQuestionsScreen.firstAnswer.android, mobileElements.MHAQuestionsScreen.firstAnswer.ios), expectedText(mobileElements.MHAQuestionsScreen.firstAnswer));
  }

  async enterAnswerAndSelect(answer: string): Promise<void> {
    if (!answer.trim()) {
      throw new TypeError('Answer must not be blank');
    }
    await this.selectAnswer(0, answer);
    await this.clickQuestionNextButton();
  }

  async completeAssessment(assessment: AssessmentDocument): Promise<void> {
    assert.ok(assessment, 'Assessment JSON must not be null');
    const details = assessment['Mental health assessment'];
    assert.ok(details, 'Assessment must include "Mental health assessment"');
    assert.equal(details.Count, details.Sections.length, 'Assessment Count must match the number of Sections');

    for (let sectionIndex = 0; sectionIndex < details.Sections.length; sectionIndex++) {
      const section = details.Sections[sectionIndex];
      this.recordStep(`Starting MHA section ${sectionIndex + 1}/${details.Sections.length}: ${section.Name}`);
      for (let questionIndex = 0; questionIndex < section.Questions.length; questionIndex++) {
        const question = section.Questions[questionIndex];
        const isFinalQuestion = sectionIndex === details.Sections.length - 1
          && questionIndex === section.Questions.length - 1;
        this.recordStep(`MHA question ${questionIndex + 1}/${section.Questions.length}: ${question.Name}`);
        await this.assertQuestion(questionIndex, normalizeConfiguredText(question.Name));

        if (question.Type.toLowerCase() === 'selectfield') {
          const values = question.Values ?? [];
          assert.ok(values.length > 0, `No answer values configured for question: ${question.Name}`);
          for (let answerIndex = 0; answerIndex < values.length; answerIndex++) {
            await this.selectAnswer(questionIndex, values[answerIndex]);
            if (!isFinalQuestion || answerIndex < values.length - 1) {
              await this.clickQuestionNextButton();
            }
          }
        } else if (!isFinalQuestion) {
          await this.clickQuestionNextButton();
        }
      }

      if (sectionIndex === details.Sections.length - 1) {
        await this.clickSubmitAssessmentButton();
      } else {
        await this.clickSectionNextButton();
      }
    }
  }

  async completeAssessmentFromResource(resourceName: string): Promise<void> {
    await this.completeAssessment(await loadAssessmentResource(resourceName));
  }

  private async assertQuestion(questionIndex: number, expectedQuestion: string): Promise<void> {
    const locator = formatMobileLocator(mobileElements.MHAQuestionsScreen.questionByIndex, { index: questionIndex });
    await this.assertTextEquals(
      await this.element(locator.android, locator.ios),
      expectedQuestion
    );
  }

  private async selectAnswer(questionIndex: number, answer: string): Promise<void> {
    const normalizedAnswer = normalizeConfiguredText(answer ?? '');
    if (!normalizedAnswer) {
      throw new TypeError('Answer must not be blank');
    }

    const answerValue = xpathLiteral(normalizedAnswer);
    const labelPattern = `[ \\t\\r\\n]*${normalizedAnswer
      .split(' ')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[ \\t\\r\\n]+')}[ \\t\\r\\n]*`;
    const answerLocator = formatMobileLocator(mobileElements.MHAQuestionsScreen.answerByText, {
      answer: answerValue,
      pattern: JSON.stringify(labelPattern)
    });
    const selector = this.session.getPlatformLocator(answerLocator.android, answerLocator.ios);
    this.recordStep(`Selecting answer for MHA question ${questionIndex + 1}: ${normalizedAnswer}`);
    await this.session.clickElement(selector);
  }
}

function normalizeConfiguredText(value: string): string {
  return value.replace(/\u00a0/g, ' ').trim();
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `concat(${value.split("'").map((part, index) => `${index ? `, "'", ` : ''}'${part}'`).join('')})`;
}
