# Hope, Inc. ERP - Project Roadmap & 8-Week Sprint Plan

This repository contains the database-driven Enterprise Resource Planning (ERP) system for Hope, Inc. Our 8-week project is divided into **four sequential sprints (2 weeks each)** to incrementally design, build, test, and deploy all six functional guide modules.

---

## 8-Week Sprint & Module Allocation

| Sprint | Timeline | Modules Covered | Core Deliverables & Focus |
| :--- | :--- | :--- | :--- |
| **Sprint 1** | Weeks 1–2 | **Module 1: Authentication & User Management** | • Repository scaffolding, branch protection, PR & issue templates<br>• Base database schema migration and sample seed data <br>• User registration (defaulting to pending status), login, and password reset flows<br>• Role-based permissions matrix (Superadmin, Admin, User) and UI wireframes |
| **Sprint 2** | Weeks 3–4 | **Module 2: Customer Management** <br>**Module 3: Product Management & Price History** | • Customer search, list, CRUD, and soft delete/restore workflows<br>• Product catalogue creation, list views, and management forms<br>• Effective-date price history tracking (add/edit/delete prices) with current-price display |
| **Sprint 3** | Weeks 5–6 | **Module 4: Department & Job Management** <br>**Module 5: Employee Management & Job History** | • Department and Job title configuration and setup<br>• Employee profile management, CRUD operations, and timelines<br>• Employee job history tracking (promotions, transfers, and salary adjustments) with effective dates |
| **Sprint 4** | Weeks 7–8 | **Module 6: Sales Transactions, Payments & Reports** | • Sales order creation, header and detail line items, and price-as-of-date auto-fill<br>• Customer payment recording and running balance tracking<br>• Comprehensive report generation, PDF export functionality, and end-to-end system testing |

---

## Development Workflow & Governance

* **Version Control:** All code changes are submitted via Pull Requests mapped directly to GitHub issues.
* **Definition of Done (DoD):** Tasks are only moved to `Done` once code is reviewed, meets the testable acceptance criteria, and passes local validation.
* **Roles & Responsibilities:** Team members operate across specialized roles including Scrum Master, Backend Developer, DB Admin, UI/UX Designer, and Tester.
