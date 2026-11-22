import { LegalPage, List, Section } from '../components/LegalPage'
import { LEGAL } from '../lib/legal'

const Privacy = () => (
  <LegalPage title="Privacy Policy">
    <Section title="Who we are">
      <p>
        {LEGAL.appName} is a study tool that turns your documents into flashcards and practice questions. This
        policy explains what information the app handles, why, and the choices you have. Questions? Write to{' '}
        <a href={`mailto:${LEGAL.contactEmail}`} className="text-ink underline">
          {LEGAL.contactEmail}
        </a>
        .
      </p>
    </Section>

    <Section title="What we collect">
      <List
        items={[
          'Account details: your email address and a password. Passwords are handled by our sign-in provider and are stored hashed; we cannot read them.',
          'Your content: the files you upload (PDF, Word, PowerPoint), the text we extract from them, and the flashcards, questions and study sets generated from them.',
          'Study activity: your answers, review schedule and progress, so the app can show your stats and plan reviews.',
          'Files you import from Google Drive (see below).',
          'Preferences kept in your browser, such as light/dark mode and colour theme.',
          'Basic technical data (for example IP address and error logs) that our hosting providers record to keep the service running and secure.',
        ]}
      />
    </Section>

    <Section title="How we use it">
      <List
        items={[
          'To create your account and keep you signed in.',
          'To read your documents and generate study material you asked for.',
          'To run spaced repetition and show your progress.',
          'To keep the app secure, fix problems and prevent abuse.',
        ]}
      />
      <p>We do not sell your information and we do not show ads.</p>
    </Section>

    <Section title="Who handles your data">
      <p>We rely on these service providers to run the app. They process data on our behalf:</p>
      <List
        items={[
          'Supabase: authentication, database and file storage.',
          'Google (Gemini API): the text of a document you choose to generate from is sent to Google’s Gemini API to produce flashcards and questions. Google processes it under its own terms for that API.',
          'Vercel and Render: hosting for the website and the server that processes documents.',
          'Google Drive and Google Picker: only if you use “Import from Google Drive”.',
        ]}
      />
      <p>
        We may also disclose information if the law requires it or to protect the safety and rights of our users
        and the service.
      </p>
    </Section>

    <Section title="Importing from Google Drive">
      <List
        items={[
          'We ask Google for the drive.file permission only. It lets the app see just the files you choose in Google’s file picker, never the rest of your Drive.',
          'The file you pick is downloaded in your browser and saved to your si-rebyu library like any file you upload. Google Docs and Slides are converted to Word and PowerPoint first.',
          'The temporary access token Google gives your browser is kept in your browser’s memory and is not stored on our servers.',
          'You can remove the app’s access at any time at myaccount.google.com/permissions.',
        ]}
      />
      <p>
        {LEGAL.appName}’s use and transfer of information received from Google APIs adheres to the Google API
        Services User Data Policy, including the Limited Use requirements. We use Drive files only to provide the
        study features you request. We do not use them for advertising, and we do not sell them or let humans read
        them except where you ask for support, it is needed for security, or the law requires it.
      </p>
    </Section>

    <Section title="How long we keep it">
      <p>
        Your documents and study sets stay in your account until you delete them. Deleting a document removes the
        file and the study sets generated from it. To delete your whole account and its data, email us. Copies
        may remain in provider backups for a short period before they are overwritten.
      </p>
    </Section>

    <Section title="Security">
      <p>
        Data travels over encrypted connections, and access to your documents and study sets is limited to your own
        account. No online service is perfectly secure, so please use a strong, unique password.
      </p>
    </Section>

    <Section title="Your choices and rights">
      <p>
        You can access, correct or delete your information, and ask questions about how it is handled, by emailing
        us. Depending on where you live (including under the Philippine Data Privacy Act of 2012), you may have
        additional rights, and we will honour them.
      </p>
    </Section>

    <Section title="Children">
      <p>
        {LEGAL.appName} is not directed to children under 13, and we do not knowingly collect their information. If
        you believe a child has given us data, contact us and we will delete it.
      </p>
    </Section>

    <Section title="Changes to this policy">
      <p>
        If we change this policy we will update the date at the top. If a change is significant, we will tell you
        in the app.
      </p>
    </Section>
  </LegalPage>
)

export default Privacy