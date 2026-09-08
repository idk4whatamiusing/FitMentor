package graph

import "context"

// Subscription resolvers mirror subscriptions.rs: empty streams.
func (r *Resolver) LogUpdated(ctx context.Context) (<-chan *logResolver, error) {
	ch := make(chan *logResolver)
	close(ch)
	return ch, nil
}

func (r *Resolver) PlanUpdated(ctx context.Context, args struct{ Table string }) (<-chan *planResolver, error) {
	ch := make(chan *planResolver)
	close(ch)
	return ch, nil
}
