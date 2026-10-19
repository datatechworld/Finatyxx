import { Clerk } from "/auth-test/clerk.js";

const statusElement =
  document.getElementById("status");

const signInElement =
  document.getElementById("sign-in");

const authenticatedArea =
  document.getElementById("authenticated-area");

const userButtonElement =
  document.getElementById("user-button");

const testApiButton =
  document.getElementById("test-api");

const apiResultElement =
  document.getElementById("api-result");

const createBusinessButton =
  document.getElementById("create-business");

const onboardingResultElement =
  document.getElementById("onboarding-result");

const testAuthorizedButton =
  document.getElementById("test-authorized");

const testDeniedButton =
  document.getElementById("test-denied");

const authorizedResultElement =
  document.getElementById("authorized-result");

const deniedResultElement =
  document.getElementById("denied-result");

const authorizationTestData = {
  tenantId:
    "9af89483-476a-4367-99b0-8cc15abc0011",
  branchId:
    "8b675c86-7c95-4da8-a0b8-37be06f3cf64",
  validPermission:
    "sales.invoices.create",
  invalidPermission:
    "finatyx.permission.does_not_exist",
  minimumBranchAccess:
    "OPERATE",
};

async function getSessionToken(clerk) {
  if (!clerk.session) {
    throw new Error(
      "No active Clerk session is available."
    );
  }

  const token = await clerk.session.getToken();

  if (!token) {
    throw new Error(
      "No Clerk session token is available."
    );
  }

  return token;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {
      error: "invalid_response",
      message: "API response was not valid JSON.",
    };
  }
}

function displayRequestResult(
  element,
  response,
  body
) {
  element.textContent =
    JSON.stringify(
      {
        httpStatus: response.status,
        response: body,
      },
      null,
      2
    );
}

function displayRequestError(
  element,
  error
) {
  element.textContent =
    JSON.stringify(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown API request error",
      },
      null,
      2
    );
}

async function callAuthorizationTest(
  clerk,
  permissionCode
) {
  const token =
    await getSessionToken(clerk);

  const response = await fetch(
    "/api/v1/authz/test",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId:
          authorizationTestData.tenantId,
        branchId:
          authorizationTestData.branchId,
        permissionCode,
        minimumBranchAccess:
          authorizationTestData.minimumBranchAccess,
      }),
    }
  );

  const body =
    await readJsonResponse(response);

  return {
    response,
    body,
  };
}

async function start() {
  try {
    statusElement.textContent =
      "Loading Finatyx authentication...";

    // Clerk's browser UI bundle exposes its UI constructor here.
    const clerkUI =
      window.__internal_ClerkUICtor;

    if (!clerkUI) {
      throw new Error(
        "Clerk UI bundle did not initialize correctly."
      );
    }

    // Get ONLY the public Clerk publishable key from our backend.
    const configResponse =
      await fetch("/auth-test/config");

    if (!configResponse.ok) {
      throw new Error(
        `Unable to load authentication config (${configResponse.status})`
      );
    }

    const { publishableKey } =
      await configResponse.json();

    if (!publishableKey) {
      throw new Error(
        "Clerk publishable key is unavailable."
      );
    }

    const clerk =
      new Clerk(publishableKey);

    // Load Clerk with its prebuilt UI components.
    await clerk.load({
      ui: {
        ClerkUI: clerkUI,
      },
    });

    // No active Clerk session yet.
    if (!clerk.user || !clerk.session) {
      statusElement.textContent =
        "Not signed in. Sign in with the Finatyx development account.";

      authenticatedArea.hidden = true;

      // Return to this local test page after Clerk completes sign-in.
      // Both destinations are explicit to avoid the development welcome page.
      const returnUrl = `${window.location.origin}/auth-test`;
      clerk.mountSignIn(signInElement, {
        forceRedirectUrl: returnUrl,
        fallbackRedirectUrl: returnUrl,
      });

      return;
    }

    // Active Clerk session exists.
    const identity =
      clerk.user.primaryEmailAddress
        ?.emailAddress ??
      clerk.user.username ??
      clerk.user.id;

    statusElement.textContent =
      `Authenticated with Clerk as ${identity}`;

    signInElement.innerHTML = "";
    authenticatedArea.hidden = false;

    clerk.mountUserButton(
      userButtonElement
    );

    // 15V.4F.5: Temporary authenticated, GET-only supplier API checks.
    // Only status and collection size are shown; no records or tokens are printed.
    const supplierSection = document.createElement("section");
    supplierSection.style.marginTop = "24px";
    supplierSection.style.padding = "16px";
    supplierSection.style.border = "1px solid #d1d5db";
    supplierSection.style.borderRadius = "8px";
    const supplierHeading = document.createElement("h2");
    supplierHeading.textContent = "4. Supplier APIs — Read-only Runtime Tests";
    supplierSection.appendChild(supplierHeading);
    const supplierNote = document.createElement("p");
    supplierNote.textContent = "Authenticated GET requests only. No supplier records will be created, changed, or posted.";
    supplierSection.appendChild(supplierNote);
    const supplierResults = document.createElement("pre");
    supplierResults.style.whiteSpace = "pre-wrap";
    supplierResults.style.overflowWrap = "anywhere";
    supplierResults.textContent = "No supplier requests made yet.";
    const tenantId = authorizationTestData.tenantId;
    const branchId = authorizationTestData.branchId;
    for (const [label, endpoint] of [
      ["Supplier Bills", "supplier-bills"],
      ["Supplier Payments", "supplier-payments"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `Test ${label} GET`;
      button.style.marginRight = "8px";
      button.addEventListener("click", async () => {
        button.disabled = true;
        supplierResults.textContent = `Testing ${label}...`;
        try {
          const token = await getSessionToken(clerk);
          const url = `/api/v1/tenants/${encodeURIComponent(tenantId)}/${endpoint}?branchId=${encodeURIComponent(branchId)}`;
          const response = await fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const body = await readJsonResponse(response);
          const data = body && body.data;
          const summary = {
            endpoint,
            httpStatus: response.status,
            result: response.ok ? "PASS" : "INVESTIGATE",
            dataIsArray: Array.isArray(data),
            recordCount: Array.isArray(data) ? data.length : null,
            error: response.ok ? null : (body.error ?? body.reason ?? "request_failed"),
            reason: response.ok ? null : (body.reason ?? null),
          };
          supplierResults.textContent = JSON.stringify(summary, null, 2);
        } catch (error) {
          supplierResults.textContent = JSON.stringify({
            endpoint,
            result: "ERROR",
            message: error instanceof Error ? error.message : "Unknown request error",
          }, null, 2);
        } finally {
          button.disabled = false;
        }
      });
      supplierSection.appendChild(button);
    }
    supplierSection.appendChild(supplierResults);
    authenticatedArea.appendChild(supplierSection);

    // -----------------------------------------------------------------------
    // Protected identity test
    // -----------------------------------------------------------------------

    testApiButton.addEventListener(
      "click",
      async () => {
        apiResultElement.textContent =
          "Calling protected Finatyx API...";

        testApiButton.disabled = true;

        try {
          const token =
            await getSessionToken(clerk);

          const response =
            await fetch(
              "/api/v1/auth/me",
              {
                method: "GET",
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },
              }
            );

          const body =
            await readJsonResponse(
              response
            );

          displayRequestResult(
            apiResultElement,
            response,
            body
          );
        } catch (error) {
          displayRequestError(
            apiResultElement,
            error
          );
        } finally {
          testApiButton.disabled = false;
        }
      }
    );

    // -----------------------------------------------------------------------
    // First-business onboarding test
    // -----------------------------------------------------------------------

    createBusinessButton.addEventListener(
      "click",
      async () => {
        onboardingResultElement.textContent =
          "Creating Finatyx test business...";

        createBusinessButton.disabled = true;

        try {
          const token =
            await getSessionToken(clerk);

          const business = {
            legalName:
              "Finatyx Test Business Ltd",
            tradingName:
              "Finatyx Test Business",
            slug:
              "finatyx-test-business",
            countryCode: "GH",
            baseCurrencyCode: "GHS",
            timezone: "Africa/Accra",
            branchName: "Head Office",
            branchCode: "HO",
          };

          const response =
            await fetch(
              "/api/v1/onboarding/business",
              {
                method: "POST",
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify(
                    business
                  ),
              }
            );

          const body =
            await readJsonResponse(
              response
            );

          displayRequestResult(
            onboardingResultElement,
            response,
            body
          );

          if (response.status === 201) {
            createBusinessButton.disabled =
              true;

            createBusinessButton.textContent =
              "Test Business Created";
          }
        } catch (error) {
          displayRequestError(
            onboardingResultElement,
            error
          );

          createBusinessButton.disabled =
            false;
        }

        if (
          !onboardingResultElement
            .textContent
            .includes('"httpStatus": 201')
        ) {
          createBusinessButton.disabled =
            false;
        }
      }
    );

    // -----------------------------------------------------------------------
    // Authorized HTTP authorization test
    // -----------------------------------------------------------------------

    testAuthorizedButton.addEventListener(
      "click",
      async () => {
        authorizedResultElement.textContent =
          "Testing authorized Finatyx access...";

        testAuthorizedButton.disabled =
          true;

        try {
          const { response, body } =
            await callAuthorizationTest(
              clerk,
              authorizationTestData
                .validPermission
            );

          displayRequestResult(
            authorizedResultElement,
            response,
            body
          );
        } catch (error) {
          displayRequestError(
            authorizedResultElement,
            error
          );
        } finally {
          testAuthorizedButton.disabled =
            false;
        }
      }
    );

    // -----------------------------------------------------------------------
    // Denied HTTP authorization test
    // -----------------------------------------------------------------------

    testDeniedButton.addEventListener(
      "click",
      async () => {
        deniedResultElement.textContent =
          "Testing deliberately denied Finatyx access...";

        testDeniedButton.disabled = true;

        try {
          const { response, body } =
            await callAuthorizationTest(
              clerk,
              authorizationTestData
                .invalidPermission
            );

          displayRequestResult(
            deniedResultElement,
            response,
            body
          );
        } catch (error) {
          displayRequestError(
            deniedResultElement,
            error
          );
        } finally {
          testDeniedButton.disabled =
            false;
        }
      }
    );
  } catch (error) {
    console.error(error);

    statusElement.textContent =
      error instanceof Error
        ? `Authentication test failed: ${error.message}`
        : "Authentication test failed.";
  }
}

start();