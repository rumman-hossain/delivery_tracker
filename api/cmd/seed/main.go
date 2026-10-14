package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/mail"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	firebaseauth "firebase.google.com/go/v4/auth"
	"golang.org/x/term"

	"github.com/rumman-hossain/delivery_tracker/api/internal/auth"
	"github.com/rumman-hossain/delivery_tracker/api/internal/domain"
	"github.com/rumman-hossain/delivery_tracker/api/internal/store"
)

func readPassword(r io.Reader) (string, error) {
	line, err := bufio.NewReader(r).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", fmt.Errorf("reading the password: %w", err)
	}

	line = strings.TrimRight(line, "\r\n")
	if line == "" {
		return "", errors.New("the password is empty")
	}

	return line, nil
}

func promptPassword() (string, error) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return readPassword(os.Stdin)
	}

	fmt.Fprint(os.Stderr, "initial password (temporary - change it after first sign-in): ")
	first, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", fmt.Errorf("reading the password: %w", err)
	}

	fmt.Fprint(os.Stderr, "confirm password: ")
	second, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", fmt.Errorf("reading the confirmation: %w", err)
	}

	if string(first) != string(second) {
		return "", errors.New("the two entries do not match")
	}
	if len(first) == 0 {
		return "", errors.New("the password is empty")
	}
	return string(first), nil
}

func main() {
	var (
		email = flag.String("email", "", "email address for the account")
		name  = flag.String("name", "", "display name")
		phone = flag.String("phone", "", "phone number, e.g. 090-1234-5678")
		role  = flag.String("role", string(domain.RoleSuperadmin),
			`account role: "superadmin" or "admin"`)
		locations = flag.Bool("locations", false,
			"register the bundled warehouses and shops instead of creating an account")
		adopt = flag.Bool("adopt", false,
			"take over an account that already exists: set its password, role and user document")
	)
	flag.Parse()

	projectForLocations := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if *locations {
		if projectForLocations == "" {
			log.Fatal("GOOGLE_CLOUD_PROJECT is not set")
		}
		ctx := context.Background()
		st, err := store.New(ctx, projectForLocations, os.Getenv("FIRESTORE_DATABASE"))
		if err != nil {
			log.Fatalf("connecting to firestore: %v", err)
		}
		if err := seedLocations(ctx, st); err != nil {
			log.Fatal(err)
		}
		return
	}

	if *email == "" {
		log.Fatal("-email is required")
	}
	if *name == "" {
		log.Fatal("-name is required")
	}
	if *phone == "" && !*adopt {
		log.Fatal("-phone is required, e.g. -phone 090-1234-5678")
	}

	if *role != string(domain.RoleSuperadmin) && *role != string(domain.RoleAdmin) {
		log.Fatal(`-role must be "superadmin" or "admin"`)
	}

	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if projectID == "" {
		log.Fatal("GOOGLE_CLOUD_PROJECT is not set")
	}

	if addr, pErr := mail.ParseAddress(*email); pErr != nil || addr.Address != *email {
		log.Fatalf("%q is not a valid email address", *email)
	}

	password, err := promptPassword()
	if err != nil {
		log.Fatal(err)
	}

	req := domain.CreateUserRequest{
		Email:        *email,
		Name:         *name,
		Phone:        *phone,
		TempPassword: password,
		Role:         domain.Role(*role),
	}

	ctx := context.Background()

	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	if err != nil {
		log.Fatalf("initialising firebase: %v", err)
	}

	client, err := app.Auth(ctx)
	if err != nil {
		log.Fatalf("building the auth client: %v", err)
	}

	st, err := store.New(ctx, projectID, os.Getenv("FIRESTORE_DATABASE"))
	if err != nil {
		log.Fatalf("connecting to firestore: %v", err)
	}

	existing, lookupErr := client.GetUserByEmail(ctx, req.Email)
	switch {
	case lookupErr != nil && !firebaseauth.IsUserNotFound(lookupErr):
		log.Fatalf("looking up %s: %v", req.Email, lookupErr)
	case lookupErr == nil && !*adopt:
		log.Fatalf("%s already has an account (uid %s). Re-run with -adopt to take it "+
			"over, which sets its password, its role claim and its user document.",
			req.Email, existing.UID)
	case lookupErr != nil && *adopt:
		log.Fatalf("-adopt was given but %s has no account. Check the address, or drop "+
			"the flag to create one.", req.Email)
	}

	if lookupErr == nil && req.Phone == "" {
		if current, gErr := st.GetUser(ctx, existing.UID); gErr == nil {
			req.Phone = current.Phone
		}
		if req.Phone == "" {
			log.Fatalf("%s has no phone number on record, so -phone is required to adopt it, "+
				"e.g. -phone 090-1234-5678", req.Email)
		}
	}

	if err := domain.ValidateCreateUser(req); err != nil {
		log.Fatal(err)
	}

	if lookupErr == nil {
		adoptAccount(ctx, client, st, existing.UID, req)
	} else {
		uid, err := auth.Provisioner{Admin: client}.Create(ctx, req)
		if err != nil {
			log.Fatalf("creating the account: %v", err)
		}
		writeUserDoc(ctx, st, uid, req, false)
		fmt.Printf("%s %s (uid %s)\n", *role, *email, uid)
	}

	fmt.Println("the role claim reaches the client only after a token refresh")
}

func writeUserDoc(ctx context.Context, st *store.Store, uid string, req domain.CreateUserRequest, adopted bool) {
	doc := domain.User{Role: req.Role, Name: req.Name, Email: req.Email, Phone: req.Phone, Active: true}

	if adopted {
		if existing, err := st.GetUser(ctx, uid); err == nil {
			doc.PhotoPath = existing.PhotoPath
		}
	}
	if err := st.PutUser(ctx, uid, doc); err != nil {
		if adopted {
			log.Fatalf("writing the user document for %s: %v\n"+
				"the account's password and name are already set; run the same command "+
				"again. Do not delete the account.", uid, err)
		}
		log.Fatalf("writing the user document for %s (the account exists; delete it and retry): %v", uid, err)
	}
}

func adoptAccount(ctx context.Context, client *firebaseauth.Client, st *store.Store, uid string, req domain.CreateUserRequest) {
	current, err := st.GetUser(ctx, uid)
	var appErr *domain.AppError
	switch {
	case err != nil && !(errors.As(err, &appErr) && appErr.Code == domain.CodeNotFound):
		log.Fatalf("reading the existing user document for %s: %v", uid, err)
	case current.ActiveTripID != "":
		log.Fatalf("%s is part-way through trip %s. Finish or cancel it before adopting "+
			"the account, or the trip can never be closed.", req.Email, current.ActiveTripID)
	}

	open, err := st.ListDriverTrips(ctx, uid)
	if err != nil {
		log.Fatalf("checking %s for open trips: %v", req.Email, err)
	}
	if len(open) > 0 {
		ids := make([]string, 0, len(open))
		for _, t := range open {
			ids = append(ids, fmt.Sprintf("%s (%s, %s)", t.ID, t.AssignedDate, t.Status))
		}
		log.Fatalf("%s still has %d open trip(s): %s\nFinish them before adopting the "+
			"account. Nothing in the admin area can close a trip on a driver's behalf.",
			req.Email, len(open), strings.Join(ids, ", "))
	}

	if err := (auth.Provisioner{Admin: client}).ResetPassword(ctx, uid, req.TempPassword); err != nil {
		log.Fatalf("adopting the account: %v", err)
	}
	if _, err := client.UpdateUser(ctx, uid,
		(&firebaseauth.UserToUpdate{}).DisplayName(req.Name).Disabled(false)); err != nil {
		log.Fatalf("adopting the account: updating it: %v", err)
	}

	writeUserDoc(ctx, st, uid, req, true)

	if err := client.SetCustomUserClaims(ctx, uid, map[string]any{"role": string(req.Role)}); err != nil {
		log.Fatalf("adopting the account: setting the role claim: %v\n"+
			"everything else is in place; run the same command again.", err)
	}

	fmt.Fprintf(os.Stderr, "adopted the existing account for %s\n", req.Email)
	fmt.Printf("%s %s (uid %s)\n", req.Role, req.Email, uid)
}
