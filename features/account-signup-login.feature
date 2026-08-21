Feature: Account signup and login
  As a new user of Money Across Borders
  I want to create an account and log in
  So that I can obtain a token to open wallets and send remittances

  Scenario: Signing up and logging in with the right credentials
    Given I have a new account with a random email and password "Str0ng-Pass!"
    When I sign up with those credentials
    Then the signup response status is 201
    And the signup response contains the account email
    When I log in with those credentials
    Then the login response status is 200
    And the login response contains a token

  Scenario: Logging in with the wrong password
    Given I have a new account with a random email and password "Str0ng-Pass!"
    When I sign up with those credentials
    Then the signup response status is 201
    When I log in with the wrong password "totally-wrong-pass"
    Then the login response status is 401
