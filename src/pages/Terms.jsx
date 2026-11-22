import { LegalPage, List, Section } from '../components/LegalPage'
import { LEGAL } from '../lib/legal'

const Terms = () => (
  <LegalPage title="Terms of Service">
    <Section title="Agreeing to these terms">
      <p>
        By creating an account or using {LEGAL.appName}, you agree to these terms and to our Privacy Policy. If you
        do not agree, please do not use the app.
      </p>
    </Section>

    <Section title="What the service is">
      <p>
        {LEGAL.appName} helps you study by turning documents you provide into flashcards and practice questions.
        The app is provided as is and may change, pause or be discontinued at any time.
      </p>
    </Section>

    <Section title="Your account">
      <List
        items={[
          'Give accurate information and keep your password secret.',
          'You are responsible for activity under your account. Tell us right away if you think it was accessed without your permission.',
        ]}
      />
    </Section>

    <Section title="Your content">
      <List
        items={[
          'You keep ownership of the documents you upload and the study material made from them.',
          'You give us permission to store, process and display that content, and to send it to our AI provider, only so we can run the features you ask for.',
          'Only upload or import files you have the right to use. Do not upload material that infringes someone else’s copyright or that you are not allowed to share.',
        ]}
      />
    </Section>

    <Section title="Acceptable use">
      <p>Please do not:</p>
      <List
        items={[
          'use the app for anything unlawful or to upload harmful, abusive or malicious content;',
          'try to break, probe or overload the service, or get around its limits;',
          'access another person’s account or data;',
          'copy, resell or reverse engineer the app except where the law allows.',
        ]}
      />
    </Section>

    <Section title="AI-generated content">
      <p>
        Flashcards and questions are created by AI and can contain mistakes or leave things out. Always check
        important facts against your original materials and your teachers. The app is a study aid, not a
        substitute for your course materials or professional advice.
      </p>
    </Section>

    <Section title="Google Drive">
      <p>
        If you import from Google Drive, you also agree to Google’s own terms. You can revoke the app’s access at
        any time from your Google Account settings.
      </p>
    </Section>

    <Section title="Ending your use">
      <p>
        You can stop using the app and delete your documents at any time, or email us to delete your account. We
        may suspend or end access if these terms are broken or the service is misused.
      </p>
    </Section>

    <Section title="No warranties">
      <p>
        The service is provided “as is” and “as available”, without promises that it will be uninterrupted,
        error-free or fit for a particular purpose. Keep your own copy of any file you cannot afford to lose.
      </p>
    </Section>

    <Section title="Limit of liability">
      <p>
        To the extent the law allows, {LEGAL.appName} and its creators are not liable for indirect or consequential
        losses, lost data, or lost grades or opportunities arising from use of the app.
      </p>
    </Section>

    <Section title="Governing law">
      <p>These terms are governed by the laws of the Republic of the Philippines.</p>
    </Section>

    <Section title="Changes and contact">
      <p>
        We may update these terms and will change the date at the top when we do. Continuing to use the app after
        a change means you accept it. Questions? Email{' '}
        <a href={`mailto:${LEGAL.contactEmail}`} className="text-ink underline">
          {LEGAL.contactEmail}
        </a>
        .
      </p>
    </Section>
  </LegalPage>
)

export default Terms