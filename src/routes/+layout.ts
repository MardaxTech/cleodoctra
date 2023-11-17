const firebaseConfig = {
    apiKey: "AIzaSyDRlsx97DcVK3FhK_3-DvMdzO244pRHNUk",
    authDomain: "cleodoctra--dev.firebaseapp.com",
    projectId: "cleodoctra--dev",
    storageBucket: "cleodoctra--dev.appspot.com",
    messagingSenderId: "590546774673",
    appId: "1:590546774673:web:d984f3a2045b19a9f1ed30"
}

const reCaptchaSiteKey = "6LejdA8pAAAAAKh6U5YEKBbnZJLcALdEt-XRyotF"

export const prerender = true
export const load = () => {
    return {
        ...firebaseConfig,
        reCaptchaSiteKey: reCaptchaSiteKey
    }
};