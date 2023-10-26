# Building a Firebase Project with GitHub Auth, Firestore, and Firebase Hosting

This guide will walk you through creating a Firebase project that includes GitHub authentication, Firestore for your database, and Firebase Hosting for web application deployment.

## Prerequisites

Before you begin, ensure that you have the following set up:

- [Firebase account](https://console.firebase.google.com/)
- [GitHub account](https://github.com/)

## Part 1: Set Up Firebase Project

1. Start by visiting the [Firebase console](https://console.firebase.google.com/) and creating a new project.

2. Set a project name and disable google analytics.

3. Once your project is created, click on "Authentication" from the left-hand menu.

4. In the Authentication section, select "Sign-in method" and enable GitHub.

5. Configure GitHub OAuth by providing your GitHub app's Client ID and Client Secret. A Github Oauth app can be created in the [Developer Settings](https://github.com/settings/developers). To create a GitHub app, you'll need a homepage URL and a callback URL. The callback URL is `https://{projectname}.firebaseapp.com/__/auth/handler`. For the homepage URL, you can use your own domain or `https://{projectname}.web.app`. Finally press "Register application" to finish creating your app.

6. *(Optional)* Under the "Settings" tab, navigate to "Authorized Domains." Here, you have the option to add any custom domains from which you will be accessing the site. This step is useful if you intend to use a custom domain rather than the default Firebase Hosting domain.

## Part 2: Set Up Firestore

1. In the Firebase console, click on "Firestore" from the left-hand menu.

2. Click "Create database" and use the default mode, in the next step we will be updating it for our usecase.

3. Next we will set the database in read-only mode by going to the "Rules" tab and setting the rules to the following
```json
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read;
    }
  }
}
```

4. In the Firebase database, create a document in the following path: "config/github." The field name should be `clientId`, and the value should be the GitHub app Client ID.

## Part 3: Build The Web Application

1. After downloading this repository, run `npm install` to install the required packages.

2. In the [Firebase console](https://console.firebase.google.com/), click on the gear icon in the top right, then open the "Project settings"

3. Under "General", scroll down to "Your apps" and create an web app by pressing the </> icon.
5. You will be prompted to nickname your app. You will also see the option to also setup firebase hosting. Keep this option unchecked. We will be doing this seperatly in part 4.

4. After registering the app, you will receive a piece of code containing a `firebaseConfig` variable. Replace the `firebaseConfig` in the `src/routes/+page.svelte` file.

5. Complete the creation by pressing "Continue to the console"

## Part 4: Deploy to Firebase Hosting

1. Install Firebase CLI if you haven't already
`npm install -g firebase-tools`
2. Authenticate the Firebase CLI with your Google account
`firebase login`
3. In your project folder, initialize Firebase Hosting
`firebase init hosting`
4. When asked to setup a project, select the "Use an existing project" option. After which, select your project from the list.
5. Then configure the public directory, in this case you should set it to "build".
6. next enter that you **do not** want to configure your website as a single-page app.
7. Next you will be prompted to setup automatic builds. I would recommend to set this up. If so, follow the instructions provided by the console.
8. After the setup is finished, run `npm run build`
9. Finally, deploy your web app to Firebase Hosting by running
`firebase deploy`
10. You did it! Your app is now online at a URL like `https://{projectname}.web.app`

### To use a custom domain, follow these additional steps:
1. Return to the [Firebase console](https://console.firebase.google.com/). Navigate to the "Hosting" menu and scroll down to "Domains"
2. At the bottom of the domain section, press the "Add custom domain" button.
3. Follow the on-screen instructions to verify and configure your custom domain. This process ensures that your custom domain is correctly linked to your Firebase Hosting.