Feature: API documentation
  As a developer integrating with Money Across Borders
  I want interactive API docs
  So that I can see every endpoint's request/response shape without reading the source

  Scenario: Swagger UI is served
    When I request the API docs page
    Then the API docs response status is 200
    And the API docs response is an HTML page
